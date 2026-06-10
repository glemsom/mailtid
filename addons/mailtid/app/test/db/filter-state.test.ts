import { describe, expect, test } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../../src/db/migrate.js";
import { FilterStateRepository } from "../../src/db/filter-state.js";

function freshRepo(): {
  repo: FilterStateRepository;
  db: Database.Database;
} {
  const db = new Database(":memory:");
  runMigrations(db);
  return { repo: new FilterStateRepository(db), db };
}

describe("FilterStateRepository", () => {
  test("returns an empty filter state when nothing has been saved", () => {
    const { repo } = freshRepo();

    expect(repo.find()).toEqual({ includes: [], excludes: [] });
  });

  test("round-trips a saved filter state through SQLite", () => {
    const { repo } = freshRepo();

    repo.save({ includes: ["asparges", "jordbaer"], excludes: ["champignon"] });

    expect(repo.find()).toEqual({
      includes: ["asparges", "jordbaer"],
      excludes: ["champignon"],
    });
  });

  test("save() replaces the previous state, it does not merge", () => {
    const { repo } = freshRepo();

    repo.save({ includes: ["asparges"], excludes: [] });
    repo.save({ includes: ["jordbaer"], excludes: ["champignon"] });

    expect(repo.find()).toEqual({
      includes: ["jordbaer"],
      excludes: ["champignon"],
    });
  });

  test("survives a fresh repository instance on the same SQLite file", () => {
    const db = new Database(":memory:");
    runMigrations(db);
    const writer = new FilterStateRepository(db);
    writer.save({ includes: ["tomat"], excludes: ["kartoffel"] });

    const reader = new FilterStateRepository(db);

    expect(reader.find()).toEqual({
      includes: ["tomat"],
      excludes: ["kartoffel"],
    });
  });
});
