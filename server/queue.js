import PQueue from 'p-queue';
import { getJob, updateJob, getBank, getDefaultResume } from './db.js';
import { scoreFit, tailorResume, evaluateMatch } from './claude.js';
import { broadcastJob } from './sse.js';

// Priority constants: higher = runs first
export const PRIORITY_USER = 10;
export const PRIORITY_SCOUT = 1;

const queue = new PQueue({ concurrency: 5 });

/** Enqueue a user-initiated tailoring job (high priority). */
export function enqueueJob(jobId) {
  queue.add(() => processJob(jobId), { priority: PRIORITY_USER });
}

/**
 * Enqueue a user-initiated job that already has fit data from Scout.
 * Skips step 1 (scoring) and goes straight to tailor + evaluate.
 */
export function enqueueJobWithFit(jobId) {
  queue.add(() => processJobWithFit(jobId), { priority: PRIORITY_USER });
}

/**
 * Enqueue a scout auto-scoring task (low priority).
 * Only runs scoreFit — no tailoring.
 */
export function enqueueScoutScore(listingId, fn) {
  return queue.add(fn, { priority: PRIORITY_SCOUT });
}

function updateAndBroadcast(jobId, fields) {
  updateJob(jobId, fields);
  broadcastJob(getJob(jobId));
}

export async function withRetry(fn, maxRetries = 3, baseDelay = 2000) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const is429 =
        err.status === 429 ||
        err.message?.includes('429') ||
        err.message?.includes('rate limit');
      if (!is429 || attempt === maxRetries) throw err;
      const delay = baseDelay * Math.pow(2, attempt);
      console.warn(`Rate limit hit, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

// ── Full 3-step pipeline (user-initiated) ─────────────────────────────────────

async function processJob(jobId) {
  const bank = getBank();
  const defaultResume = getDefaultResume();

  if (!bank.content) {
    updateAndBroadcast(jobId, { status: 'error', error: 'Experience bank is empty. Please add your experience first.' });
    return;
  }
  if (!defaultResume.content) {
    updateAndBroadcast(jobId, { status: 'error', error: 'Default resume not generated. Please generate it first.' });
    return;
  }

  const job = getJob(jobId);

  try {
    // Step 1: Fit Assessment
    updateAndBroadcast(jobId, { status: 'scoring' });
    const fitResult = await withRetry(() => scoreFit(bank.content, job.jd_text));
    updateAndBroadcast(jobId, {
      company: fitResult.company || job.company,
      role_title: fitResult.role_title || job.role_title,
      composite_score: fitResult.composite_score,
      fit_summary: fitResult.summary,
      fit_dimensions: JSON.stringify(fitResult.dimensions),
      gaps_to_address: JSON.stringify(fitResult.gaps_to_address || []),
    });

    await runTailorAndEvaluate(jobId, fitResult, bank.content, defaultResume.content);
  } catch (err) {
    console.error(`Job ${jobId} failed:`, err.message);
    updateAndBroadcast(jobId, { status: 'error', error: err.message });
  }
}

// ── 2-step pipeline (promoted from Scout, fit already done) ──────────────────

async function processJobWithFit(jobId) {
  const bank = getBank();
  const defaultResume = getDefaultResume();

  if (!bank.content) {
    updateAndBroadcast(jobId, { status: 'error', error: 'Experience bank is empty.' });
    return;
  }
  if (!defaultResume.content) {
    updateAndBroadcast(jobId, { status: 'error', error: 'Default resume not generated.' });
    return;
  }

  const job = getJob(jobId);

  try {
    // Reconstruct fitResult from stored data for context in tailor prompt
    const fitResult = {
      composite_score: job.composite_score,
      summary: job.fit_summary,
      dimensions: job.fit_dimensions ? JSON.parse(job.fit_dimensions) : {},
      gaps_to_address: job.gaps_to_address ? JSON.parse(job.gaps_to_address) : [],
    };

    await runTailorAndEvaluate(jobId, fitResult, bank.content, defaultResume.content);
  } catch (err) {
    console.error(`Job ${jobId} (promoted) failed:`, err.message);
    updateAndBroadcast(jobId, { status: 'error', error: err.message });
  }
}

// ── Shared steps 2 & 3 ───────────────────────────────────────────────────────

async function runTailorAndEvaluate(jobId, fitResult, bankContent, defaultResumeContent) {
  const job = getJob(jobId);

  // Step 2: Tailor
  updateAndBroadcast(jobId, { status: 'tailoring' });
  const tailorResult = await withRetry(() =>
    tailorResume(bankContent, defaultResumeContent, job.jd_text, fitResult)
  );
  updateAndBroadcast(jobId, {
    tailored_resume: tailorResult.tailored_resume,
    outreach_blurb: tailorResult.outreach_blurb,
    tailoring_notes: tailorResult.tailoring_notes,
  });

  // Step 3: Match Evaluation
  updateAndBroadcast(jobId, { status: 'evaluating' });
  const matchResult = await withRetry(() =>
    evaluateMatch(tailorResult.tailored_resume, job.jd_text)
  );
  updateAndBroadcast(jobId, {
    status: 'complete',
    match_score: matchResult.match_score,
    match_keyword: matchResult.keyword_coverage,
    match_evidence: matchResult.evidence_strength,
    match_gaps: matchResult.gap_visibility,
    match_suggestion: matchResult.improvement_suggestion,
  });
}

export function getQueueStatus() {
  return { pending: queue.pending, size: queue.size };
}
