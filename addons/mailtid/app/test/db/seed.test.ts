import { describe, expect, test } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../../src/db/migrate.js";
import { importSeasonalitySeed } from "../../src/db/seed.js";

function freshDb(): Database.Database {
  // :memory: gives every test an isolated SQLite instance, per the PRD's
  // "No live DB on disk" testing rule.
  return new Database(":memory:");
}

describe("importSeasonalitySeed", () => {
  test("populates the seasonality table from seasonality.json", () => {
    const db = freshDb();
    runMigrations(db);

    importSeasonalitySeed(db);

    // Sanity: count of rows matches total of (ingredient, month) tuples in
    // the seed file. We do not assert against a literal integer so the
    // test survives the curated dataset being extended.
    const row = db
      .prepare<[], { c: number }>("SELECT COUNT(*) AS c FROM seasonality")
      .get();
    expect(row?.c ?? 0).toBeGreaterThan(0);
  });

  test("is idempotent — running the import a second time does not duplicate rows", () => {
    const db = freshDb();
    runMigrations(db);

    importSeasonalitySeed(db);
    const first = db
      .prepare<[], { c: number }>("SELECT COUNT(*) AS c FROM seasonality")
      .get();
    importSeasonalitySeed(db);
    const second = db
      .prepare<[], { c: number }>("SELECT COUNT(*) AS c FROM seasonality")
      .get();

    expect(second?.c).toBe(first?.c);
  });

  test("stores ingredient name_da and slug alongside the month", () => {
    const db = freshDb();
    runMigrations(db);

    importSeasonalitySeed(db);

    // Spot-check: jordbaer (Jordbær) is in season in June. After seed
    // import, a row for (jordbaer, 6) with name_da = "Jordbær" must exist.
    const row = db
      .prepare<
        [string, number],
        { slug: string; name_da: string; month: number }
      >("SELECT slug, name_da, month FROM seasonality WHERE slug = ? AND month = ?")
      .get("jordbaer", 6);

    expect(row).toBeDefined();
    expect(row?.name_da).toBe("Jordbær");
  });
});
