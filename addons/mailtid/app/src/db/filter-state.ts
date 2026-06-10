import type Database from "better-sqlite3";

/**
 * The user's in-season filter state. Persisted as a single row in
 * SQLite (the user has exactly one current filter state on the
 * home screen). The slugs are the stable identifiers from the
 * `seasonality` table; display names are looked up by the
 * presentation layer.
 *
 * Semantics (per ADR-0001 and CONTEXT.md):
 * - `includes` — slugs flagged as "include". The LLM is told to
 *   include at least one of these in every suggestion (OR).
 * - `excludes` — slugs flagged as "exclude". The LLM is told to
 *   include none of these in any suggestion (AND).
 */
export interface FilterState {
  includes: string[];
  excludes: string[];
}

/** The empty filter state. The default before the user touches a chip. */
export const EMPTY_FILTER_STATE: FilterState = { includes: [], excludes: [] };

/**
 * Single-row repository for the user's in-season filter state.
 * Backed by the `filter_state` table; the table is constrained to
 * a single row (id = 1) and `save()` is an upsert against that row.
 */
export class FilterStateRepository {
  constructor(private readonly db: Database.Database) {}

  /**
   * Read the current filter state. Returns the empty state if the
   * row has not been written yet (e.g. on a fresh database before
   * the user has touched a chip).
   */
  find(): FilterState {
    const row = this.db
      .prepare<[], { includes_json: string; excludes_json: string }>(
        `SELECT includes_json, excludes_json FROM filter_state WHERE id = 1`,
      )
      .get();
    if (!row) return { ...EMPTY_FILTER_STATE };
    return {
      includes: parseSlugList(row.includes_json),
      excludes: parseSlugList(row.excludes_json),
    };
  }

  /**
   * Replace the saved filter state with the given one. Subsequent
   * `find()` calls return this state.
   */
  save(state: FilterState): void {
    this.db
      .prepare(
        `INSERT INTO filter_state (id, includes_json, excludes_json)
         VALUES (1, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           includes_json = excluded.includes_json,
           excludes_json = excluded.excludes_json`,
      )
      .run(JSON.stringify(state.includes), JSON.stringify(state.excludes));
  }
}

function parseSlugList(raw: string): string[] {
  if (raw.length === 0) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((v): v is string => typeof v === "string");
}
