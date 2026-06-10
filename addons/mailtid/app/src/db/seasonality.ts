import type Database from "better-sqlite3";
import { importSeasonalitySeed } from "./seed.js";

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
 * An ingredient grouped across months — the shape the admin UI
 * renders as one row with checkboxes for each month.
 */
export interface SeasonalityIngredientGroup {
  slug: string;
  nameDa: string;
  months: number[];
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

  /**
   * All ingredients in the table, each grouped with its sorted
   * months list. Ordered alphabetically by Danish display name.
   */
  findAll(): SeasonalityIngredientGroup[] {
    const rows = this.db
      .prepare<[], { slug: string; name_da: string; month: number }>(
        `SELECT slug, name_da, month FROM seasonality ORDER BY slug, month`,
      )
      .all();

    const map = new Map<string, { nameDa: string; months: number[] }>();
    for (const r of rows) {
      let entry = map.get(r.slug);
      if (!entry) {
        entry = { nameDa: r.name_da, months: [] };
        map.set(r.slug, entry);
      }
      entry.months.push(r.month);
    }

    const result = Array.from(
      map,
      ([slug, v]) => ({ slug, nameDa: v.nameDa, months: v.months }),
    );
    result.sort((a, b) => a.nameDa.localeCompare(b.nameDa, "da"));
    return result;
  }

  /**
   * Insert or replace all rows for a given slug. Removes any
   * existing rows for the slug first, then inserts one row per
   * month. Runs inside a transaction so the operation is atomic.
   */
  upsert(slug: string, nameDa: string, months: number[]): void {
    const del = this.db.prepare("DELETE FROM seasonality WHERE slug = ?");
    const ins = this.db.prepare(
      "INSERT INTO seasonality (slug, name_da, month) VALUES (?, ?, ?)",
    );
    const tx = this.db.transaction(() => {
      del.run(slug);
      for (const m of months) {
        ins.run(slug, nameDa, m);
      }
    });
    tx();
  }

  /**
   * Remove every row for the given slug. Idempotent — no error
   * when the slug does not exist.
   */
  deleteBySlug(slug: string): void {
    this.db.prepare("DELETE FROM seasonality WHERE slug = ?").run(slug);
  }

  /**
   * Remove every row from the seasonality table.
   */
  truncate(): void {
    this.db.exec("DELETE FROM seasonality");
  }

  /**
   * Wipe the table and re-import from the seed JSON. This is the
   * "Nulstil til seed" operation from the admin UI.
   */
  resetSeed(): void {
    this.truncate();
    importSeasonalitySeed(this.db);
  }
}
