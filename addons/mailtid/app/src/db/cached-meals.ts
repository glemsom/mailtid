import type Database from "better-sqlite3";
import type { MealInspiration } from "../inspiration/service.js";

/**
 * A batch of cached meal inspirations from the most recent
 * "Vis 5 nye" call. Stored as a single-row table so the home
 * page can render them server-side on the next visit —
 * making the first paint snappy without an LLM round-trip.
 */
export interface CachedMeals {
  meals: MealInspiration[];
  savedAt: number;
}

/**
 * Repository for the cached-meals table. The table holds exactly
 * one row (id = 1) so `save()` is always an upsert and `find()`
 * returns null before the first generation.
 */
export class CachedMealsRepository {
  constructor(private readonly db: Database.Database) {}

  /**
   * Persist a batch of MealInspirations. Overwrites any previous
   * cache row so only the most recent generation is kept.
   */
  save(meals: MealInspiration[]): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO cached_meals (id, meals_json, saved_at)
         VALUES (1, ?, ?)`,
      )
      .run(JSON.stringify(meals), Date.now());
  }

  /**
   * Return the most recently cached batch, or null when the cache
   * is empty (first visit / never generated).
   */
  find(): CachedMeals | null {
    const row = this.db
      .prepare<[], { meals_json: string; saved_at: number }>(
        `SELECT meals_json, saved_at FROM cached_meals WHERE id = 1`,
      )
      .get();
    if (!row) return null;
    return {
      meals: JSON.parse(row.meals_json) as MealInspiration[],
      savedAt: row.saved_at,
    };
  }

  /**
   * Delete the cached batch. Useful when the user changes their
   * filter state and the stale cache would conflict.
   */
  clear(): void {
    this.db.prepare(`DELETE FROM cached_meals WHERE id = 1`).run();
  }
}
