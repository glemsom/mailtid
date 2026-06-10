import type Database from "better-sqlite3";

/**
 * Idempotent schema setup for Mailtid. Safe to run on every start —
 * each statement uses `IF NOT EXISTS` so subsequent runs are no-ops.
 *
 * Tables created:
 * - `seasonality(slug, name_da, month)` with composite primary key
 *   `(slug, month)`. The denormalized shape (one row per ingredient/month
 *   pair) keeps "what is in season in month N?" to a single SELECT.
 * - `filter_state(id, includes_json, excludes_json)` — single-row table
 *   holding the user's current in-season filter selection. `id` is
 *   always 1; `save()` is an upsert against that row.
 */
export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS seasonality (
      slug    TEXT    NOT NULL,
      name_da TEXT    NOT NULL,
      month   INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
      PRIMARY KEY (slug, month)
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS filter_state (
      id            INTEGER PRIMARY KEY CHECK (id = 1),
      includes_json TEXT    NOT NULL DEFAULT '[]',
      excludes_json TEXT    NOT NULL DEFAULT '[]'
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS custom_ingredients (
      slug       TEXT    PRIMARY KEY,
      name_da    TEXT    NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );
  `);
}
