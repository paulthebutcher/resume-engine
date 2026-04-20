/**
 * Scout runner — discovers job listings via Exa title-based searches,
 * then auto-scores new listings with the fit assessment pipeline.
 */
import { searchExa, getExaApiKey } from './exa.js';
import { passesLocationFilter } from './locations.js';
import {
  listSearches,
  upsertListing, updateListing, listListings,
  getConfig,
  startRun, updateRun, getActiveRun,
} from './scout-db.js';
import { getBank, getCompTarget } from './db.js';
import { scoreFit } from './claude.js';
import { enqueueScoutScore, withRetry } from './queue.js';
import { broadcastScout } from './sse.js';

let isRunning = false;

// ── Normalization helpers for fuzzy dedup ─────────────────────────────────────

function normalizeCompany(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|co|company|technologies|technology|solutions|software|systems|group|international|global)\b\.?/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function normalizeTitle(title) {
  return (title || '')
    .toLowerCase()
    .replace(/\b(senior|sr\.?|junior|jr\.?|lead|staff|principal|associate)\b/gi, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isDuplicate(existingListings, listing) {
  const normCompany = normalizeCompany(listing.company);
  const normTitle = normalizeTitle(listing.role_title);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  return existingListings.some((existing) => {
    if (listing.posting_url && existing.posting_url && existing.posting_url === listing.posting_url) return true;
    if (existing.discovered_at < thirtyDaysAgo) return false;
    const existingCompany = normalizeCompany(existing.company);
    const existingTitle = normalizeTitle(existing.role_title);
    return existingCompany && normCompany && existingCompany === normCompany &&
           existingTitle && normTitle && existingTitle === normTitle;
  });
}

// ── Keyword filter ────────────────────────────────────────────────────────────

function passesFilter(roleTitle) {
  const title = (roleTitle || '').toLowerCase();
  const includeKeywords = (() => {
    try { return JSON.parse(getConfig('title_keywords') || '[]'); } catch { return []; }
  })();
  const excludeKeywords = (() => {
    try { return JSON.parse(getConfig('title_exclude') || '[]'); } catch { return []; }
  })();
  const hasInclude = includeKeywords.some((kw) => title.includes(kw.toLowerCase()));
  const hasExclude = excludeKeywords.some((kw) => title.includes(kw.toLowerCase()));
  return hasInclude && !hasExclude;
}

// ── Main runner ───────────────────────────────────────────────────────────────

export async function runScout() {
  if (isRunning) {
    console.log('[Scout] Run already in progress, skipping.');
    return null;
  }

  const activeRun = getActiveRun();
  if (activeRun) {
    console.log('[Scout] Stale active run found, marking as error and continuing.');
    updateRun(activeRun.id, { status: 'error', finished_at: new Date().toISOString() });
  }

  isRunning = true;
  const runId = startRun();
  const stats = { searches_run: 0, new_listings: 0, scored: 0, skipped: 0, errors: 0 };

  console.log(`[Scout] Run ${runId} started`);
  broadcastScout({ type: 'run_started', runId });

  try {
    const existingListings = listListings();

    // ── Exa title-based searches ───────────────────────────────────────────
    if (!getExaApiKey()) {
      console.log('[Scout] No Exa API key set — skipping searches');
    } else {
      const searches = listSearches().filter((s) => s.active);

      for (const search of searches) {
        stats.searches_run++;
        try {
          await new Promise((r) => setTimeout(r, 1000));
          const rawListings = await searchExa(search.query, { dateFilter: search.date_filter || 'week' });

          for (const listing of rawListings) {
            if (isDuplicate(existingListings, listing)) continue;
            const passes = passesFilter(listing.role_title) && passesLocationFilter(listing.location);
            const saved = upsertListing({
              ...listing,
              auto_score_status: passes ? 'pending' : 'skipped',
            });
            if (saved) {
              existingListings.push(saved);
              if (passes) stats.new_listings++;
              else stats.skipped++;
            }
          }

          broadcastScout({ type: 'search_complete', query: search.query, count: rawListings.length });
        } catch (err) {
          stats.errors++;
          console.warn(`[Scout] Exa search failed for "${search.query}":`, err.message);
        }
      }
    }

    // ── Auto-score pending listings ────────────────────────────────────────
    const bank = getBank();
    if (!bank?.content) {
      console.log('[Scout] Experience bank empty — skipping auto-score');
    } else {
      const pending = listListings({ status: 'pending' });
      console.log(`[Scout] Auto-scoring ${pending.length} pending listings`);
      const compTarget = getCompTarget();

      const scorePromises = pending.map((listing) =>
        enqueueScoutScore(listing.id, async () => {
          try {
            updateListing(listing.id, { auto_score_status: 'scoring' });
            const fitResult = await withRetry(() =>
              scoreFit(bank.content, listing.jd_text || listing.role_title, compTarget)
            );
            updateListing(listing.id, {
              auto_score_status: 'scored',
              composite_score: fitResult.composite_score,
              fit_dimensions: JSON.stringify(fitResult.dimensions),
              fit_summary: fitResult.summary,
              gaps_to_address: JSON.stringify(fitResult.gaps_to_address || []),
            });
            stats.scored++;
            broadcastScout({ type: 'listing_scored', listingId: listing.id });
          } catch (err) {
            stats.errors++;
            updateListing(listing.id, { auto_score_status: 'error' });
            console.warn(`[Scout] Score failed for listing ${listing.id}:`, err.message);
          }
        })
      );

      await Promise.allSettled(scorePromises);
    }
  } finally {
    isRunning = false;
    const finished = new Date().toISOString();
    updateRun(runId, {
      searches_run: stats.searches_run,
      new_listings: stats.new_listings,
      scored: stats.scored,
      skipped: stats.skipped,
      errors: stats.errors,
      finished_at: finished,
      status: 'complete',
    });
    console.log(`[Scout] Run ${runId} complete —`, JSON.stringify(stats));
    broadcastScout({ type: 'run_complete', runId, stats });
  }

  return runId;
}

export function getScoutRunning() {
  return isRunning;
}
