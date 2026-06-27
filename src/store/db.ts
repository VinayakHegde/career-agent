import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

/**
 * SQLite connection + schema for saved application history. A local file-backed
 * store keeps the CLI useful on its own (browse past runs) and gives the future
 * web app a real persistence layer to build on.
 */

export const DEFAULT_DB_PATH = path.resolve(process.cwd(), ".data", "career-agent.db");

/** Resolve the database path (env override wins). */
export function resolveDbPath(): string {
  return process.env.CAREER_DB_PATH?.trim() || DEFAULT_DB_PATH;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS applications (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at      TEXT    NOT NULL,
  model           TEXT    NOT NULL,
  phase           TEXT    NOT NULL,
  mode            TEXT    NOT NULL,
  cv_text         TEXT    NOT NULL,
  job_text        TEXT    NOT NULL,
  pack_json       TEXT    NOT NULL,
  grounding_score REAL,
  honesty_score   REAL
);
`;

let cached: Database.Database | undefined;

/** Open (or reuse) the database connection, creating the schema on first use. */
export function getDb(dbPath = resolveDbPath()): Database.Database {
  if (cached) return cached;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  cached = db;
  return db;
}

/** Close the cached connection (mainly for tests). */
export function closeDb(): void {
  cached?.close();
  cached = undefined;
}
