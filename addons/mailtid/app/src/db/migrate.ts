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
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_profile (
      id              INTEGER PRIMARY KEY CHECK (id = 1),
      dietary_pattern TEXT    NOT NULL DEFAULT 'omnivore',
      allergies_json  TEXT    NOT NULL DEFAULT '[]',
      dislikes        TEXT    NOT NULL DEFAULT ''
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS model_cache (
      model_id     TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      tier         TEXT NOT NULL CHECK (tier IN ('free', 'paid'))
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS active_model (
      id    INTEGER PRIMARY KEY CHECK (id = 1),
      model TEXT
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS favourites (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT    NOT NULL,
      description TEXT    NOT NULL,
      saved_at    INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );
  `);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_favourites_title
      ON favourites(title);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS cooked_history (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT    NOT NULL,
      description TEXT    NOT NULL,
      cooked_at   INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_key (
      id  INTEGER PRIMARY KEY CHECK (id = 1),
      key TEXT    NOT NULL DEFAULT ''
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS pantry_items (
      slug       TEXT    PRIMARY KEY,
      name_da    TEXT    NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS cached_meals (
      id         INTEGER PRIMARY KEY CHECK (id = 1),
      meals_json TEXT    NOT NULL DEFAULT '[]',
      saved_at   INTEGER NOT NULL DEFAULT 0
    );
  `);
}
