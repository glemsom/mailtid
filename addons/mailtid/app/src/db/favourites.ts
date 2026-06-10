import type Database from "better-sqlite3";

/**
 * A single saved favourite meal. Returned when the user bookmarks
 * a Meal Inspiration from the home screen.
 */
export interface FavouriteMeal {
  id: number;
  title: string;
  description: string;
  savedAt: number;
}

/**
 * Repository for the user's favourite meals. Backed by the
 * `favourites` table. The title is the uniqueness key — a second
 * `add()` of the same title is a no-op (INSERT OR IGNORE).
 */
export class FavouritesRepository {
  constructor(private readonly db: Database.Database) {}

  /**
   * Bookmark a Meal Inspiration. If a favourite with the same title
   * already exists, returns the existing row unchanged. Otherwise
   * inserts a new row and returns it with the generated id and
   * timestamp.
   */
  add(meal: { title: string; description: string }): FavouriteMeal {
    // Try insert — UNIQUE index on title prevents duplicates.
    this.db
      .prepare(
        `INSERT OR IGNORE INTO favourites (title, description)
         VALUES (?, ?)`,
      )
      .run(meal.title, meal.description);

    // Read back (either the just-inserted row or the existing one).
    const row = this.db
      .prepare<
        [string],
        { id: number; title: string; description: string; saved_at: number }
      >(
        `SELECT id, title, description, saved_at
         FROM favourites WHERE title = ?`,
      )
      .get(meal.title)!;

    return {
      id: row.id,
      title: row.title,
      description: row.description,
      savedAt: row.saved_at,
    };
  }

  /**
   * All saved favourites, newest first (by id descending, which
   * matches insertion order).
   */
  list(): FavouriteMeal[] {
    const rows = this.db
      .prepare<
        [],
        { id: number; title: string; description: string; saved_at: number }
      >(
        `SELECT id, title, description, saved_at
         FROM favourites
         ORDER BY id DESC`,
      )
      .all();
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      savedAt: r.saved_at,
    }));
  }
}
