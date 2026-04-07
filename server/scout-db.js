/**
 * Scout module — database tables and CRUD functions.
 * Uses the same SQLite instance as the main db module via './db-instance.js'.
 */
import { getDb } from './db-instance.js';
import { randomUUID } from 'crypto';

const db = getDb();

// ── Schema ────────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS target_companies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    ats_platform TEXT,
    ats_slug TEXT,
    career_page_url TEXT,
    added_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_checked TEXT,
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS scout_searches (
    id TEXT PRIMARY KEY,
    query TEXT NOT NULL,
    location TEXT,
    remote_ok INTEGER NOT NULL DEFAULT 1,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS discovered_listings (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    source_id TEXT NOT NULL,
    company TEXT NOT NULL,
    role_title TEXT NOT NULL,
    location TEXT,
    posting_url TEXT,
    jd_text TEXT,
    discovered_at TEXT NOT NULL DEFAULT (datetime('now')),
    auto_score_status TEXT NOT NULL DEFAULT 'pending',
    composite_score INTEGER,
    fit_dimensions TEXT,
    fit_summary TEXT,
    gaps_to_address TEXT,
    dismissed INTEGER NOT NULL DEFAULT 0,
    promoted_to_job_id TEXT,
    UNIQUE(source, source_id)
  );

  CREATE TABLE IF NOT EXISTS scout_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS scout_runs (
    id TEXT PRIMARY KEY,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at TEXT,
    companies_checked INTEGER DEFAULT 0,
    searches_run INTEGER DEFAULT 0,
    new_listings INTEGER DEFAULT 0,
    scored INTEGER DEFAULT 0,
    skipped INTEGER DEFAULT 0,
    errors INTEGER DEFAULT 0,
    status TEXT DEFAULT 'running'
  );
`);

// ── Migrations ────────────────────────────────────────────────────────────────

// Add locations and date_filter to scout_searches
const hasLocations = db.prepare("SELECT name FROM pragma_table_info('scout_searches') WHERE name='locations'").get();
if (!hasLocations) {
  db.exec("ALTER TABLE scout_searches ADD COLUMN locations TEXT NOT NULL DEFAULT '[]'");
  db.exec("ALTER TABLE scout_searches ADD COLUMN date_filter TEXT NOT NULL DEFAULT 'week'");
}

// Add searches_run to scout_runs
const hasSearchesRun = db.prepare("SELECT name FROM pragma_table_info('scout_runs') WHERE name='searches_run'").get();
if (!hasSearchesRun) {
  db.exec('ALTER TABLE scout_runs ADD COLUMN searches_run INTEGER DEFAULT 0');
}

// ── Default config ────────────────────────────────────────────────────────────

const defaultConfig = {
  title_keywords: JSON.stringify([
    'product', 'strategy', 'chief of staff', 'director', 'head of',
    'vp', 'transformation', 'operations', 'general manager',
  ]),
  title_exclude: JSON.stringify([
    'intern', 'junior', 'associate', 'warehouse', 'support',
    'sales development', 'accounting', 'recruiter',
  ]),
  location_mode: 'us_metro',
  custom_cities: '[]',
};

for (const [key, value] of Object.entries(defaultConfig)) {
  db.prepare('INSERT OR IGNORE INTO scout_config (key, value) VALUES (?, ?)').run(key, value);
}

// ── Seed data ─────────────────────────────────────────────────────────────────

// v2 seed searches — Exa-based, national scope, no per-search location
const v2SeedSearches = [
  'Chief of Staff technology company',
  'VP of Product',
  'Director of Product Strategy',
  'Head of Product Management',
  'General Manager technology',
  'Head of Strategy',
  'Director of Operations technology company',
  'VP Strategy and Operations',
];

// Fresh DB — seed v2 searches directly
const searchCount = db.prepare('SELECT COUNT(*) as n FROM scout_searches').get().n;
if (searchCount === 0) {
  for (const query of v2SeedSearches) {
    db.prepare(
      "INSERT INTO scout_searches (id, query, locations, date_filter) VALUES (?, ?, '[]', 'week')"
    ).run(randomUUID(), query);
  }
  db.prepare('INSERT OR REPLACE INTO scout_config (key, value) VALUES (?, ?)').run('seed_version', '2');
}

// Existing DB — migrate v1 seed searches to v2
const seedVer = db.prepare('SELECT value FROM scout_config WHERE key = ?').get('seed_version')?.value || '1';
if (seedVer !== '2') {
  const oldSeedQueries = ['Chief of Staff', 'Director of Product Strategy', 'Head of Product', 'VP Product Strategy'];
  for (const q of oldSeedQueries) {
    db.prepare('DELETE FROM scout_searches WHERE query = ?').run(q);
  }
  for (const query of v2SeedSearches) {
    const existing = db.prepare('SELECT id FROM scout_searches WHERE query = ?').get(query);
    if (!existing) {
      db.prepare(
        "INSERT INTO scout_searches (id, query, locations, date_filter) VALUES (?, ?, '[]', 'week')"
      ).run(randomUUID(), query);
    }
  }
  db.prepare('INSERT OR REPLACE INTO scout_config (key, value) VALUES (?, ?)').run('seed_version', '2');
}

// ── Scout Searches ────────────────────────────────────────────────────────────

export function listSearches() {
  return db.prepare('SELECT * FROM scout_searches ORDER BY created_at DESC').all();
}

export function getSearch(id) {
  return db.prepare('SELECT * FROM scout_searches WHERE id = ?').get(id);
}

export function addSearch({ query, locations, date_filter }) {
  const id = randomUUID();
  db.prepare(
    "INSERT INTO scout_searches (id, query, locations, date_filter) VALUES (?, ?, ?, ?)"
  ).run(id, query, JSON.stringify(locations || []), date_filter || 'week');
  return db.prepare('SELECT * FROM scout_searches WHERE id = ?').get(id);
}

export function updateSearch(id, fields) {
  const allowed = ['query', 'locations', 'date_filter', 'active'];
  const keys = Object.keys(fields).filter((k) => allowed.includes(k));
  if (!keys.length) return;
  const sets = keys.map((k) => `${k} = ?`).join(', ');
  db.prepare(`UPDATE scout_searches SET ${sets} WHERE id = ?`).run(...keys.map((k) => fields[k]), id);
  return db.prepare('SELECT * FROM scout_searches WHERE id = ?').get(id);
}

export function deleteSearch(id) {
  db.prepare('DELETE FROM scout_searches WHERE id = ?').run(id);
}

// ── Discovered Listings ───────────────────────────────────────────────────────

export function upsertListing({
  source, source_id, company, role_title, location, posting_url, jd_text, auto_score_status,
}) {
  const existing = db.prepare('SELECT id FROM discovered_listings WHERE source = ? AND source_id = ?').get(source, source_id);
  if (existing) return null;

  const id = randomUUID();
  db.prepare(`
    INSERT INTO discovered_listings
      (id, source, source_id, company, role_title, location, posting_url, jd_text, auto_score_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, source, source_id, company, role_title, location || null, posting_url || null,
    jd_text || null, auto_score_status || 'pending');
  return db.prepare('SELECT * FROM discovered_listings WHERE id = ?').get(id);
}

export function updateListing(id, fields) {
  const allowed = [
    'auto_score_status', 'composite_score', 'fit_dimensions', 'fit_summary',
    'gaps_to_address', 'dismissed', 'promoted_to_job_id', 'jd_text',
    'company', 'role_title',
  ];
  const keys = Object.keys(fields).filter((k) => allowed.includes(k));
  if (!keys.length) return;
  const sets = keys.map((k) => `${k} = ?`).join(', ');
  db.prepare(`UPDATE discovered_listings SET ${sets} WHERE id = ?`).run(...keys.map((k) => fields[k]), id);
  return db.prepare('SELECT * FROM discovered_listings WHERE id = ?').get(id);
}

export function getListing(id) {
  return db.prepare('SELECT * FROM discovered_listings WHERE id = ?').get(id);
}

export function listListings({ minScore, maxScore, company, hideDismissed, status } = {}) {
  const conditions = [];
  const params = [];

  if (hideDismissed) conditions.push('dismissed = 0');
  if (company) { conditions.push('company = ?'); params.push(company); }
  if (status) { conditions.push('auto_score_status = ?'); params.push(status); }
  if (minScore != null) { conditions.push('composite_score >= ?'); params.push(minScore); }
  if (maxScore != null) { conditions.push('composite_score <= ?'); params.push(maxScore); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return db.prepare(
    `SELECT * FROM discovered_listings ${where} ORDER BY composite_score DESC NULLS LAST, discovered_at DESC`
  ).all(...params);
}

export function getUnreviewedCount() {
  return db.prepare(
    "SELECT COUNT(*) as n FROM discovered_listings WHERE auto_score_status = 'scored' AND dismissed = 0 AND promoted_to_job_id IS NULL"
  ).get().n;
}

// ── Scout Config ──────────────────────────────────────────────────────────────

export function getConfig(key) {
  const row = db.prepare('SELECT value FROM scout_config WHERE key = ?').get(key);
  return row ? row.value : null;
}

export function setConfig(key, value) {
  db.prepare('INSERT OR REPLACE INTO scout_config (key, value) VALUES (?, ?)').run(key, value);
}

// ── Scout Runs ────────────────────────────────────────────────────────────────

export function startRun() {
  const id = randomUUID();
  db.prepare('INSERT INTO scout_runs (id) VALUES (?)').run(id);
  return id;
}

export function updateRun(id, fields) {
  const allowed = [
    'finished_at', 'companies_checked', 'searches_run', 'new_listings',
    'scored', 'skipped', 'errors', 'status',
  ];
  const keys = Object.keys(fields).filter((k) => allowed.includes(k));
  if (!keys.length) return;
  const sets = keys.map((k) => `${k} = ?`).join(', ');
  db.prepare(`UPDATE scout_runs SET ${sets} WHERE id = ?`).run(...keys.map((k) => fields[k]), id);
}

export function getLastRun() {
  return db.prepare("SELECT * FROM scout_runs WHERE status != 'running' ORDER BY started_at DESC LIMIT 1").get();
}

export function getActiveRun() {
  return db.prepare("SELECT * FROM scout_runs WHERE status = 'running' ORDER BY started_at DESC LIMIT 1").get();
}
