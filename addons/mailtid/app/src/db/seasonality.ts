import type Database from "better-sqlite3";

/**
 * A single (ingredient, month) row in the `seasonality` table.
 * The denormalized shape keeps "what is in season in month N?"
 * a single SELECT.
 */
export interface SeasonalityIngredient {
  /** Stable, lowercase, ASCII-only identifier. */
  slug: string;
  /** Danish display name, e.g. "Jordbær". */
  nameDa: string;
  /** Month the ingredient is in season, 1-12. */
  month: number;
}

/**
 * Read-side repository for the `seasonality` table. Owns the SQL;
 * callers see only domain types.
 */
export class SeasonalityRepository {
  constructor(private readonly db: Database.Database) {}

  /**
   * All ingredients in season during the given month (1-12). Ordered
   * alphabetically by Danish display name so a UI consumer can render
   * chips in a stable, reviewable order.
   */
  findInSeasonForMonth(month: number): SeasonalityIngredient[] {
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return [];
    }
    const rows = this.db
      .prepare<
        [number],
        { slug: string; name_da: string; month: number }
      >(
        `SELECT slug, name_da, month
         FROM seasonality
         WHERE month = ?`,
      )
      .all(month);
    const result = rows.map((r) => ({
      slug: r.slug,
      nameDa: r.name_da,
      month: r.month,
    }));
    // SQLite's default collation is byte-wise; we want Danish (so
    // "Æbler" sorts after "Agurk", "Kørvel" before "Kålrabi"). Sort
    // in-process with the same locale the seed uses.
    result.sort((a, b) => a.nameDa.localeCompare(b.nameDa, "da"));
    return result;
  }
}
