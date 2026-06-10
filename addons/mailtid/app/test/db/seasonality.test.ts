import { describe, expect, test } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../../src/db/migrate.js";
import { importSeasonalitySeed, readSeasonalitySeed } from "../../src/db/seed.js";
import { SeasonalityRepository } from "../../src/db/seasonality.js";

function freshRepo(): SeasonalityRepository {
  const db = new Database(":memory:");
  runMigrations(db);
  importSeasonalitySeed(db);
  return new SeasonalityRepository(db);
}

describe("SeasonalityRepository.findInSeasonForMonth", () => {
  test("returns ingredients in season for June (month 6)", () => {
    const repo = freshRepo();

    const result = repo.findInSeasonForMonth(6);

    // Jordbær is in season in June (months [5, 6, 7] per the seed).
    const jordbaer = result.find((i) => i.slug === "jordbaer");
    expect(jordbaer).toBeDefined();
    expect(jordbaer?.nameDa).toBe("Jordbær");
    expect(jordbaer?.month).toBe(6);
  });

  test("does not return ingredients that are out of season for the given month", () => {
    const repo = freshRepo();

    const result = repo.findInSeasonForMonth(6);
    const slugs = result.map((i) => i.slug);

    // Rosenkål is only in season Sep-Dec, so June must not include it.
    expect(slugs).not.toContain("rosenkaal");
  });

  test("returns an empty list for an out-of-range month", () => {
    const repo = freshRepo();

    expect(repo.findInSeasonForMonth(0)).toEqual([]);
    expect(repo.findInSeasonForMonth(13)).toEqual([]);
    expect(repo.findInSeasonForMonth(2.5)).toEqual([]);
  });

  test("orders results alphabetically by Danish display name", () => {
    const repo = freshRepo();

    const result = repo.findInSeasonForMonth(6);
    const names = result.map((i) => i.nameDa);
    const sorted = [...names].sort((a, b) => a.localeCompare(b, "da"));
    expect(names).toEqual(sorted);
  });
});

describe("SeasonalityRepository.findAll", () => {
  test("returns all ingredients from the seasonality table grouped by slug", () => {
    const repo = freshRepo();

    const all = repo.findAll();

    // The seed file has ~80 ingredients.
    expect(all.length).toBeGreaterThan(50);
    // Every entry must have slug, nameDa, months.
    for (const ing of all) {
      expect(typeof ing.slug).toBe("string");
      expect(typeof ing.nameDa).toBe("string");
      expect(Array.isArray(ing.months)).toBe(true);
      expect(ing.months.length).toBeGreaterThan(0);
      // Months must be sorted.
      for (let i = 1; i < ing.months.length; i++) {
        expect(ing.months[i]).toBeGreaterThan(ing.months[i - 1]);
      }
    }
    // Spot-check: Jordbær has months [5, 6, 7].
    const jordbaer = all.find((i) => i.slug === "jordbaer");
    expect(jordbaer).toBeDefined();
    expect(jordbaer!.nameDa).toBe("Jordbær");
    expect(jordbaer!.months).toEqual([5, 6, 7]);
  });

  test("orders results alphabetically by Danish display name", () => {
    const repo = freshRepo();

    const all = repo.findAll();
    const names = all.map((i) => i.nameDa);
    const sorted = [...names].sort((a, b) => a.localeCompare(b, "da"));
    expect(names).toEqual(sorted);
  });
});
