import { getDb } from './db-instance.js';

const db = getDb();

const DIM_KEYS = [
  'hard_requirements',
  'core_responsibilities',
  'domain_industry',
  'seniority_scope',
  'strategic_value',
  'compensation_plausibility',
];

const SILENCE_DAYS = 21;

function mean(nums) {
  const clean = nums.filter((n) => typeof n === 'number' && !Number.isNaN(n));
  if (!clean.length) return null;
  return clean.reduce((a, b) => a + b, 0) / clean.length;
}

function classify(job, nowMs) {
  const status = job.application_status;
  if (['heard_back', 'interviewing', 'offer'].includes(status)) return 'positive';
  if (['rejected', 'passed'].includes(status)) return 'negative';
  if (status === 'applied') {
    const anchor = job.status_updated_at || job.created_at;
    const iso = anchor.replace(' ', 'T') + 'Z';
    const ageDays = (nowMs - new Date(iso).getTime()) / 86400000;
    return ageDays > SILENCE_DAYS ? 'negative' : 'pending';
  }
  return 'pending';
}

export function computeOutcomeCorrelations() {
  const jobs = db.prepare(`
    SELECT id, application_status, status_updated_at, created_at, fit_dimensions, composite_score
    FROM jobs
    WHERE application_status IS NOT NULL AND fit_dimensions IS NOT NULL
  `).all();

  const nowMs = Date.now();
  const buckets = { positive: [], negative: [], pending: [] };

  for (const j of jobs) {
    let dims;
    try { dims = JSON.parse(j.fit_dimensions); } catch { continue; }
    const bucket = classify(j, nowMs);
    buckets[bucket].push({ dims, composite: j.composite_score });
  }

  const correlations = DIM_KEYS.map((key) => {
    const posScores = buckets.positive.map((b) => b.dims[key]?.score);
    const negScores = buckets.negative.map((b) => b.dims[key]?.score);
    const positiveMean = mean(posScores);
    const negativeMean = mean(negScores);
    const delta = positiveMean != null && negativeMean != null ? positiveMean - negativeMean : null;
    return { dimension: key, positiveMean, negativeMean, delta };
  });

  const denom = buckets.positive.length + buckets.negative.length;

  return {
    funnel: {
      total: jobs.length,
      positive: buckets.positive.length,
      negative: buckets.negative.length,
      pending: buckets.pending.length,
      callbackRate: denom > 0 ? buckets.positive.length / denom : null,
    },
    correlations,
    compositeDelta:
      buckets.positive.length && buckets.negative.length
        ? mean(buckets.positive.map((b) => b.composite)) - mean(buckets.negative.map((b) => b.composite))
        : null,
    silenceDays: SILENCE_DAYS,
  };
}
