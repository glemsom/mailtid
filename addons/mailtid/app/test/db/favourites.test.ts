import { describe, expect, test, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../../src/db/migrate.js";
import { FavouritesRepository } from "../../src/db/favourites.js";

function freshDb(): Database.Database {
  const db = new Database(":memory:");
  runMigrations(db);
  return db;
}

describe("FavouritesRepository", () => {
  test("add saves a meal and returns the saved entry with id and timestamp", () => {
    const db = freshDb();
    const repo = new FavouritesRepository(db);

    const saved = repo.add({
      title: "Jordbærtærte",
      description: "Sprød tærte med friske jordbær.",
    });

    expect(saved.id).toBeGreaterThan(0);
    expect(saved.title).toBe("Jordbærtærte");
    expect(saved.description).toBe("Sprød tærte med friske jordbær.");
    expect(saved.savedAt).toBeGreaterThan(0);
  });

  test("list returns all favourites, newest first", () => {
    const db = freshDb();
    const repo = new FavouritesRepository(db);

    repo.add({ title: "Første", description: "Første ret." });
    repo.add({ title: "Anden", description: "Anden ret." });
    repo.add({ title: "Tredje", description: "Tredje ret." });

    const list = repo.list();
    expect(list).toHaveLength(3);
    // Newest first.
    expect(list[0]?.title).toBe("Tredje");
    expect(list[1]?.title).toBe("Anden");
    expect(list[2]?.title).toBe("Første");
  });

  test("add is idempotent — same title saved twice returns the existing row", () => {
    const db = freshDb();
    const repo = new FavouritesRepository(db);

    const first = repo.add({
      title: "Jordbærtærte",
      description: "Sprød tærte med friske jordbær.",
    });
    const second = repo.add({
      title: "Jordbærtærte",
      description: "Ny beskrivelse.",
    });

    // Same id — deduped by title.
    expect(second.id).toBe(first.id);
    // Description unchanged (first write wins).
    expect(second.description).toBe("Sprød tærte med friske jordbær.");
    // Only one row.
    expect(repo.list()).toHaveLength(1);
  });

  test("list returns empty array when no favourites exist", () => {
    const db = freshDb();
    const repo = new FavouritesRepository(db);
    expect(repo.list()).toEqual([]);
  });
});

describe("favourites table (migration)", () => {
  test("migration creates the favourites table", () => {
    const db = freshDb();
    // Table exists and has the expected columns.
    const cols = db
      .prepare(
        `SELECT name FROM pragma_table_info('favourites') ORDER BY cid`,
      )
      .all() as { name: string }[];
    const names = cols.map((c) => c.name);
    expect(names).toContain("id");
    expect(names).toContain("title");
    expect(names).toContain("description");
    expect(names).toContain("saved_at");
  });

  test("favourites table has an index on title for dedup lookups", () => {
    const db = freshDb();
    const indexes = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'favourites'`,
      )
      .all() as { name: string }[];
    // Should have an index — exact name doesn't matter.
    expect(indexes.length).toBeGreaterThanOrEqual(1);
  });
});
