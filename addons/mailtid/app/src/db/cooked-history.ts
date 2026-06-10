import type Database from "better-sqlite3";

/**
 * A single cooked-history entry. Created when the user taps
 * "Har lavet" on a Meal Inspiration card.
 */
export interface CookedMeal {
  id: number;
  title: string;
  description: string;
  cookedAt: number;
}

/**
 * Repository for the user's cooked-history log. Every "Har lavet"
 * tap appends a new row — even the same meal cooked twice in one
 * week gets two entries. The 14-day prompt window is enforced at
 * query time by the caller, not by the repository.
 */
export class CookedHistoryRepository {
  constructor(private readonly db: Database.Database) {}

  /**
   * Stamp a meal as cooked. Always inserts a new row with a
   * fresh timestamp. Returns the persisted entry.
   */
  stamp(meal: { title: string; description: string }): CookedMeal {
    const result = this.db
      .prepare(
        `INSERT INTO cooked_history (title, description)
         VALUES (?, ?)`,
      )
      .run(meal.title, meal.description);

    return {
      id: Number(result.lastInsertRowid),
      title: meal.title,
      description: meal.description,
      cookedAt: Date.now(),
    };
  }

  /**
   * All meals cooked on or after `sinceMs` (a Unix-ms timestamp),
   * newest first. The 14-day window is imposed by the caller
   * computing `Date.now() - 14 * 24 * 60 * 60 * 1000` and passing
   * the result as `sinceMs`.
   */
  listSince(sinceMs: number): CookedMeal[] {
    const rows = this.db
      .prepare<
        [number],
        {
          id: number;
          title: string;
          description: string;
          cooked_at: number;
        }
      >(
        `SELECT id, title, description, cooked_at
         FROM cooked_history
         WHERE cooked_at >= ?
         ORDER BY cooked_at DESC`,
      )
      .all(sinceMs);
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      cookedAt: r.cooked_at,
    }));
  }
}
