import { randomUUID } from 'crypto';
import { getDb } from './db-instance.js';

const db = getDb();

db.exec(`
  CREATE TABLE IF NOT EXISTS experience_bank (
    id TEXT PRIMARY KEY DEFAULT 'singleton',
    content TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS default_resume (
    id TEXT PRIMARY KEY DEFAULT 'singleton',
    content TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    company TEXT,
    role_title TEXT,
    jd_text TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    fit_score INTEGER,
    fit_analysis TEXT,
    tailored_resume TEXT,
    match_score INTEGER,
    match_analysis TEXT,
    outreach_blurb TEXT,
    error TEXT
  );

  CREATE TABLE IF NOT EXISTS user_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  INSERT OR IGNORE INTO experience_bank (id, content) VALUES ('singleton', '');
  INSERT OR IGNORE INTO default_resume (id, content) VALUES ('singleton', '');
  INSERT OR IGNORE INTO user_config (key, value) VALUES ('comp_target_min', '150000');
  INSERT OR IGNORE INTO user_config (key, value) VALUES ('comp_target_max', '190000');
`);

// ── Migrations ────────────────────────────────────────────────────────────────
const jobCols = db.pragma('table_info(jobs)').map((c) => c.name);

// Round 1 migrations (from previous session)
if (!jobCols.includes('bank_version')) {
  db.exec('ALTER TABLE jobs ADD COLUMN bank_version TEXT');
}
if (!jobCols.includes('application_status')) {
  db.exec('ALTER TABLE jobs ADD COLUMN application_status TEXT');
}

// Round 2 migrations — richer scoring fields
const newCols = [
  ['composite_score', 'INTEGER'],
  ['fit_summary', 'TEXT'],
  ['fit_dimensions', 'TEXT'],
  ['gaps_to_address', 'TEXT'],
  ['match_keyword', 'TEXT'],
  ['match_evidence', 'TEXT'],
  ['match_gaps', 'TEXT'],
  ['match_suggestion', 'TEXT'],
  ['tailoring_notes', 'TEXT'],
  ['status_updated_at', 'TEXT'],
  ['recruiter_verdict', 'TEXT'],
  ['recruiter_scan', 'TEXT'],
  ['draft_resume', 'TEXT'],
  ['refinement_notes', 'TEXT'],
  ['refined_at', 'TEXT'],
];
for (const [col, type] of newCols) {
  if (!jobCols.includes(col)) {
    db.exec(`ALTER TABLE jobs ADD COLUMN ${col} ${type}`);
  }
}

// Migrate existing rows: copy fit_score → composite_score, fit_analysis → fit_summary
db.exec(`
  UPDATE jobs SET composite_score = fit_score WHERE composite_score IS NULL AND fit_score IS NOT NULL;
  UPDATE jobs SET fit_summary = fit_analysis WHERE fit_summary IS NULL AND fit_analysis IS NOT NULL;
  UPDATE jobs SET status_updated_at = created_at WHERE status_updated_at IS NULL;
`);

// ── Experience Bank ───────────────────────────────────────────────────────────
export function getBank() {
  return db.prepare('SELECT content, updated_at FROM experience_bank WHERE id = ?').get('singleton');
}

export function saveBank(content) {
  db.prepare(
    "UPDATE experience_bank SET content = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(content, 'singleton');
}

// ── Default Resume ────────────────────────────────────────────────────────────
export function getDefaultResume() {
  return db.prepare('SELECT content, updated_at FROM default_resume WHERE id = ?').get('singleton');
}

export function saveDefaultResume(content) {
  db.prepare(
    "UPDATE default_resume SET content = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(content, 'singleton');
}

// ── Jobs ──────────────────────────────────────────────────────────────────────
export function createJob({ company, role_title, jd_text }) {
  const id = randomUUID();
  const bank = getBank();
  const bankVersion = bank?.updated_at || null;
  db.prepare(
    'INSERT INTO jobs (id, company, role_title, jd_text, status, bank_version) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, company || null, role_title || null, jd_text, 'queued', bankVersion);
  return id;
}

export function getJob(id) {
  return db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
}

export function updateJob(id, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const sets = keys.map((k) => `${k} = ?`).join(', ');
  const vals = keys.map((k) => fields[k]);
  db.prepare(`UPDATE jobs SET ${sets} WHERE id = ?`).run(...vals, id);
}

export function listJobs({ sort = 'created_at', order = 'DESC', search = '', appStatus = '' } = {}) {
  const allowedSorts = ['created_at', 'composite_score', 'company', 'match_score', 'application_status'];
  const col = allowedSorts.includes(sort) ? sort : 'created_at';
  const dir = order === 'ASC' ? 'ASC' : 'DESC';

  const conditions = [];
  const params = [];

  if (search) {
    conditions.push('(company LIKE ? OR role_title LIKE ? OR jd_text LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (appStatus === 'applied') {
    conditions.push("application_status = 'applied'");
  } else if (appStatus === 'active') {
    conditions.push("application_status IN ('heard_back', 'interviewing')");
  } else if (appStatus === 'closed') {
    conditions.push("application_status IN ('rejected', 'offer', 'passed')");
  } else if (appStatus === 'not_applied') {
    conditions.push('application_status IS NULL');
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return db.prepare(`SELECT * FROM jobs ${where} ORDER BY ${col} ${dir}`).all(...params);
}

export function setApplicationStatus(id, status) {
  db.prepare(
    "UPDATE jobs SET application_status = ?, status_updated_at = datetime('now') WHERE id = ?"
  ).run(status || null, id);
}

export function deleteJob(id) {
  db.prepare('DELETE FROM jobs WHERE id = ?').run(id);
}

// ── User Config ───────────────────────────────────────────────────────────────
export function getConfig(key) {
  const row = db.prepare('SELECT value FROM user_config WHERE key = ?').get(key);
  return row ? row.value : null;
}

export function setConfig(key, value) {
  db.prepare('INSERT OR REPLACE INTO user_config (key, value) VALUES (?, ?)').run(key, value);
}

export function getCompTarget() {
  const min = Number(getConfig('comp_target_min')) || 150000;
  const max = Number(getConfig('comp_target_max')) || 190000;
  return { min, max };
}
