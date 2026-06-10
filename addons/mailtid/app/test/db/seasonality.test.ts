import { describe, expect, test } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../../src/db/migrate.js";
import { importSeasonalitySeed } from "../../src/db/seed.js";
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
