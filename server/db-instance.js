/**
 * Shared SQLite instance — imported by both db.js and scout-db.js.
 * Ensures only one Database connection is created.
 */
import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');
mkdirSync(dataDir, { recursive: true });

const db = new Database(join(dataDir, 'resume-engine.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function getDb() {
  return db;
}
