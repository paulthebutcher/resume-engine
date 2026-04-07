/**
 * ATS feed fetchers for Lever, Greenhouse, and SerpAPI.
 * All return a normalized array of listing objects.
 */

const FETCH_TIMEOUT = 15000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Fetch with timeout */
async function fetchJSON(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Strip HTML tags and collapse whitespace */
function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, '')
    .replace(/&[a-z]+;/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── Lever ─────────────────────────────────────────────────────────────────────

/**
 * Fetch all postings from a Lever ATS.
 * Returns normalized listing objects.
 */
export async function fetchLever(slug) {
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`;
  const data = await fetchJSON(url);
  if (!Array.isArray(data)) throw new Error(`Lever returned unexpected shape for ${slug}`);

  return data.map((p) => ({
    source: 'lever',
    source_id: p.id,
    company: slug, // will be overridden by company name from db
    role_title: p.text || '',
    location: p.categories?.location || p.categories?.allLocations?.[0] || '',
    posting_url: p.hostedUrl || `https://jobs.lever.co/${slug}/${p.id}`,
    jd_text: stripHtml(p.descriptionPlain || p.description || ''),
  }));
}

// ── Greenhouse ────────────────────────────────────────────────────────────────

/**
 * Fetch all jobs from a Greenhouse ATS, with full JD text via detail calls.
 * Returns normalized listing objects.
 */
export async function fetchGreenhouse(slug) {
  const listUrl = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`;
  const data = await fetchJSON(listUrl);
  const jobs = data.jobs || [];

  const listings = [];
  for (const job of jobs) {
    await sleep(300); // be polite between detail calls
    let jdText = '';
    try {
      // content=true usually includes content, but fall back to detail call if empty
      if (job.content) {
        jdText = stripHtml(job.content);
      } else {
        const detail = await fetchJSON(
          `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs/${job.id}`
        );
        jdText = stripHtml(detail.content || '');
      }
    } catch {
      // use what we have
    }

    listings.push({
      source: 'greenhouse',
      source_id: String(job.id),
      company: slug,
      role_title: job.title || '',
      location: job.location?.name || '',
      posting_url: job.absolute_url || `https://boards.greenhouse.io/${slug}/jobs/${job.id}`,
      jd_text: jdText,
    });
  }
  return listings;
}

/**
 * Fetch a single job's JD text from its ATS posting URL.
 * Supports Lever and Greenhouse URLs.
 * Throws if the URL format is not recognized.
 */
export async function fetchJobJd(url) {
  const leverMatch = url.match(/jobs\.lever\.co\/([^/]+)\/([^/?#]+)/);
  if (leverMatch) {
    const data = await fetchJSON(`https://api.lever.co/v0/postings/${leverMatch[1]}/${leverMatch[2]}`);
    return stripHtml(data.descriptionPlain || data.description || '');
  }

  const ghMatch = url.match(/boards\.greenhouse\.io\/([^/]+)\/jobs\/(\d+)/);
  if (ghMatch) {
    const data = await fetchJSON(`https://boards-api.greenhouse.io/v1/boards/${ghMatch[1]}/jobs/${ghMatch[2]}`);
    return stripHtml(data.content || '');
  }

  throw new Error('Unsupported ATS URL format');
}
