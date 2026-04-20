import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  getBank,
  saveBank,
  getDefaultResume,
  saveDefaultResume,
  createJob,
  getJob,
  updateJob,
  listJobs,
  deleteJob,
  setApplicationStatus,
  getCompTarget,
  setConfig as setUserConfigValue,
} from './db.js';
import { generateDefaultResume } from './claude.js';
import { enqueueJob, enqueueJobWithFit, getQueueStatus } from './queue.js';
import { generateDocx } from './docx.js';
import { addClient, broadcastJob } from './sse.js';
import {
  listSearches, getSearch, addSearch, updateSearch, deleteSearch,
  listListings, getListing, updateListing,
  getLastRun, getActiveRun, getUnreviewedCount,
  getConfig, setConfig,
} from './scout-db.js';
import { runScout, getScoutRunning } from './scout.js';
import { searchExa, getExaApiKey } from './exa.js';
import { fetchJobJd } from './ats.js';
import { computeOutcomeCorrelations } from './analytics.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.SERVER_PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '5mb' }));

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(join(__dirname, '..', 'dist')));
}

// ── Experience Bank ───────────────────────────────────────────────────────────
app.get('/api/bank', (req, res) => res.json(getBank()));

app.put('/api/bank', (req, res) => {
  const { content } = req.body;
  if (typeof content !== 'string') return res.status(400).json({ error: 'content required' });
  saveBank(content);
  res.json({ ok: true });
});

// ── Default Resume ────────────────────────────────────────────────────────────
app.get('/api/resume', (req, res) => res.json(getDefaultResume()));

app.put('/api/resume', (req, res) => {
  const { content } = req.body;
  if (typeof content !== 'string') return res.status(400).json({ error: 'content required' });
  saveDefaultResume(content);
  res.json({ ok: true });
});

app.post('/api/resume/generate', async (req, res) => {
  try {
    const bank = getBank();
    if (!bank.content) return res.status(400).json({ error: 'Experience bank is empty' });
    const resume = await generateDefaultResume(bank.content);
    saveDefaultResume(resume);
    res.json({ content: resume });
  } catch (err) {
    console.error('Generate resume error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Analytics ─────────────────────────────────────────────────────────────────
app.get('/api/analytics/outcomes', (req, res) => {
  try {
    res.json(computeOutcomeCorrelations());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── User Config ───────────────────────────────────────────────────────────────
app.get('/api/user/config', (req, res) => {
  res.json(getCompTarget());
});

app.put('/api/user/config', (req, res) => {
  const { min, max } = req.body;
  const minNum = Number(min);
  const maxNum = Number(max);
  if (!Number.isInteger(minNum) || !Number.isInteger(maxNum) || minNum <= 0 || maxNum <= 0) {
    return res.status(400).json({ error: 'min and max must be positive integers' });
  }
  if (minNum > maxNum) {
    return res.status(400).json({ error: 'min must be less than or equal to max' });
  }
  setUserConfigValue('comp_target_min', String(minNum));
  setUserConfigValue('comp_target_max', String(maxNum));
  res.json(getCompTarget());
});

// ── SSE stream ────────────────────────────────────────────────────────────────
app.get('/api/jobs/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); }
  }, 25000);

  const remove = addClient(res);
  req.on('close', () => { clearInterval(heartbeat); remove(); });
});

// ── Jobs ──────────────────────────────────────────────────────────────────────
app.get('/api/jobs', (req, res) => {
  const { sort, order, search, appStatus } = req.query;
  res.json(listJobs({ sort, order, search, appStatus }));
});

app.get('/api/jobs/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

app.post('/api/jobs', (req, res) => {
  const { jd_text, company, role_title } = req.body;
  if (!jd_text?.trim()) return res.status(400).json({ error: 'jd_text required' });
  const id = createJob({ company, role_title, jd_text });
  broadcastJob(getJob(id));
  enqueueJob(id);
  res.status(201).json({ id });
});

app.post('/api/jobs/:id/rerun', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  updateJob(job.id, { status: 'queued', error: null });
  broadcastJob(getJob(job.id));
  enqueueJob(job.id);
  res.json({ ok: true });
});

app.delete('/api/jobs/:id', (req, res) => {
  deleteJob(req.params.id);
  res.json({ ok: true });
});

app.patch('/api/jobs/:id/status', (req, res) => {
  const { application_status } = req.body;
  const allowed = [null, 'applied', 'heard_back', 'interviewing', 'rejected', 'offer', 'passed'];
  if (!allowed.includes(application_status)) return res.status(400).json({ error: 'Invalid status' });
  setApplicationStatus(req.params.id, application_status);
  broadcastJob(getJob(req.params.id));
  res.json({ ok: true });
});

// ── Export ────────────────────────────────────────────────────────────────────
app.get('/api/jobs/:id/docx', async (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (!job.tailored_resume) return res.status(400).json({ error: 'No tailored resume available' });
  try {
    const buffer = await generateDocx(job.tailored_resume);
    const filename = `${(job.company || 'resume').replace(/[^a-zA-Z0-9]/g, '_')}_${(job.role_title || 'role').replace(/[^a-zA-Z0-9]/g, '_')}.docx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Queue Status ──────────────────────────────────────────────────────────────
app.get('/api/queue', (req, res) => res.json(getQueueStatus()));

// ── Scout: Searches ───────────────────────────────────────────────────────────
app.get('/api/scout/searches', (req, res) => res.json(listSearches()));

app.post('/api/scout/searches', (req, res) => {
  const { query, locations, date_filter } = req.body;
  if (!query?.trim()) return res.status(400).json({ error: 'query required' });
  res.status(201).json(addSearch({ query, locations, date_filter }));
});

app.put('/api/scout/searches/:id', (req, res) => {
  res.json(updateSearch(req.params.id, req.body));
});

app.delete('/api/scout/searches/:id', (req, res) => {
  deleteSearch(req.params.id);
  res.json({ ok: true });
});

app.post('/api/scout/searches/:id/test', async (req, res) => {
  const search = getSearch(req.params.id);
  if (!search) return res.status(404).json({ error: 'Not found' });
  if (!getExaApiKey()) return res.status(400).json({ error: 'Exa API key not configured' });
  try {
    const results = await searchExa(search.query, { dateFilter: search.date_filter || 'week', numResults: 5 });
    res.json({
      results: results.map((r) => ({
        role_title: r.role_title,
        company: r.company,
        location: r.location,
        posting_url: r.posting_url,
        source: r.source,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Scout: Listings ───────────────────────────────────────────────────────────
app.get('/api/scout/listings', (req, res) => {
  const { minScore, maxScore, company, hideDismissed, status } = req.query;
  res.json(listListings({
    minScore: minScore != null ? Number(minScore) : undefined,
    maxScore: maxScore != null ? Number(maxScore) : undefined,
    company: company || undefined,
    hideDismissed: hideDismissed === 'true',
    status: status || undefined,
  }));
});

app.put('/api/scout/listings/:id/dismiss', (req, res) => {
  const listing = getListing(req.params.id);
  if (!listing) return res.status(404).json({ error: 'Not found' });
  updateListing(req.params.id, { dismissed: 1 });
  res.json({ ok: true });
});

app.patch('/api/scout/listings/:id', (req, res) => {
  const listing = getListing(req.params.id);
  if (!listing) return res.status(404).json({ error: 'Not found' });
  const updated = updateListing(req.params.id, req.body);
  res.json(updated);
});

app.post('/api/scout/listings/:id/fetch-jd', async (req, res) => {
  const listing = getListing(req.params.id);
  if (!listing) return res.status(404).json({ error: 'Not found' });
  if (!listing.posting_url) return res.status(400).json({ error: 'No posting URL' });
  try {
    const jdText = await fetchJobJd(listing.posting_url);
    if (!jdText) return res.status(400).json({ error: 'Could not extract JD text' });
    updateListing(req.params.id, { jd_text: jdText });
    res.json({ ok: true, jd_text: jdText });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/scout/listings/:id/promote', (req, res) => {
  const listing = getListing(req.params.id);
  if (!listing) return res.status(404).json({ error: 'Listing not found' });
  if (listing.promoted_to_job_id) return res.json({ id: listing.promoted_to_job_id, existing: true });

  // Create job, copying fit data from listing if scored
  const jobId = createJob({
    company: listing.company,
    role_title: listing.role_title,
    jd_text: listing.jd_text || `${listing.role_title} at ${listing.company}`,
  });

  // If the listing was already scored, copy fit data and skip step 1
  if (listing.auto_score_status === 'scored' && listing.composite_score != null) {
    updateJob(jobId, {
      status: 'queued',
      composite_score: listing.composite_score,
      fit_dimensions: listing.fit_dimensions,
      fit_summary: listing.fit_summary,
      gaps_to_address: listing.gaps_to_address,
    });
    broadcastJob(getJob(jobId));
    enqueueJobWithFit(jobId);
  } else {
    broadcastJob(getJob(jobId));
    enqueueJob(jobId);
  }

  updateListing(req.params.id, { promoted_to_job_id: jobId });
  res.status(201).json({ id: jobId });
});

// ── Scout: Config ─────────────────────────────────────────────────────────────
app.get('/api/scout/config', (req, res) => {
  const exaKey = getConfig('exa_api_key') || '';
  res.json({
    title_keywords: JSON.parse(getConfig('title_keywords') || '[]'),
    title_exclude: JSON.parse(getConfig('title_exclude') || '[]'),
    location_mode: getConfig('location_mode') || 'us_metro',
    custom_cities: JSON.parse(getConfig('custom_cities') || '[]'),
    exa_api_key_set: !!exaKey,
    exa_api_key_preview: exaKey ? `${exaKey.slice(0, 4)}...${exaKey.slice(-4)}` : '',
  });
});

app.put('/api/scout/config', (req, res) => {
  const { title_keywords, title_exclude, location_mode, custom_cities, exa_api_key } = req.body;
  if (title_keywords !== undefined) setConfig('title_keywords', JSON.stringify(title_keywords));
  if (title_exclude !== undefined) setConfig('title_exclude', JSON.stringify(title_exclude));
  if (location_mode !== undefined) setConfig('location_mode', location_mode);
  if (custom_cities !== undefined) setConfig('custom_cities', JSON.stringify(custom_cities));
  if (exa_api_key !== undefined) setConfig('exa_api_key', exa_api_key);
  res.json({ ok: true });
});

// ── Scout: Runner ─────────────────────────────────────────────────────────────
app.post('/api/scout/run', async (req, res) => {
  if (getScoutRunning()) return res.status(409).json({ error: 'Scout run already in progress' });
  res.json({ ok: true, message: 'Scout run started' });
  // Run async — client sees status via SSE
  runScout().catch((err) => console.error('[Scout] Run failed:', err));
});

app.get('/api/scout/status', (req, res) => {
  const lastRun = getLastRun();
  const activeRun = getActiveRun();
  const unreviewedCount = getUnreviewedCount();
  res.json({
    running: getScoutRunning(),
    last_run: lastRun || null,
    active_run: activeRun || null,
    unreviewed_count: unreviewedCount,
  });
});

// ── SPA fallback ──────────────────────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(join(__dirname, '..', 'dist', 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Resume Engine API running on http://localhost:${PORT}`);
});
