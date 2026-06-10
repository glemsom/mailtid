import type Database from "better-sqlite3";

/**
 * Idempotent schema setup for Mailtid. Safe to run on every start —
 * each statement uses `IF NOT EXISTS` so subsequent runs are no-ops.
 *
 * Tables created:
 * - `seasonality(slug, name_da, month)` with composite primary key
 *   `(slug, month)`. The denormalized shape (one row per ingredient/month
 *   pair) keeps "what is in season in month N?" to a single SELECT.
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
}
