import { describe, expect, test } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../../src/db/migrate.js";
import { CookedHistoryRepository } from "../../src/db/cooked-history.js";

function freshDb(): Database.Database {
  const db = new Database(":memory:");
  runMigrations(db);
  return db;
}

describe("cooked_history table (migration)", () => {
  test("migration creates the cooked_history table", () => {
    const db = freshDb();
    const cols = db
      .prepare(
        `SELECT name FROM pragma_table_info('cooked_history') ORDER BY cid`,
      )
      .all() as { name: string }[];
    const names = cols.map((c) => c.name);
    expect(names).toContain("id");
    expect(names).toContain("title");
    expect(names).toContain("description");
    expect(names).toContain("cooked_at");
  });
});

describe("CookedHistoryRepository", () => {
  test("stamp persists a meal with a timestamp", () => {
    const db = freshDb();
    const repo = new CookedHistoryRepository(db);

    const saved = repo.stamp({
      title: "Jordbærtærte",
      description: "Sprød tærte med friske jordbær.",
    });

    expect(saved.id).toBeGreaterThan(0);
    expect(saved.title).toBe("Jordbærtærte");
    expect(saved.description).toBe("Sprød tærte med friske jordbær.");
    expect(saved.cookedAt).toBeGreaterThan(0);
  });

  test("stamp always inserts — same meal cooked twice gets two rows", () => {
    const db = freshDb();
    const repo = new CookedHistoryRepository(db);

    const first = repo.stamp({
      title: "Jordbærtærte",
      description: "Sprød tærte med friske jordbær.",
    });
    const second = repo.stamp({
      title: "Jordbærtærte",
      description: "Sprød tærte med friske jordbær.",
    });

    expect(second.id).not.toBe(first.id);
    // Two rows.
    const rows = db.prepare("SELECT COUNT(*) as cnt FROM cooked_history").get() as { cnt: number };
    expect(rows.cnt).toBe(2);
  });

  test("listSince returns only meals cooked on or after the given timestamp", () => {
    const db = freshDb();
    const repo = new CookedHistoryRepository(db);

    // Insert a row with a known timestamp.
    const now = Date.now();
    const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
    const twoWeeksAgo = now - FOURTEEN_DAYS_MS;
    const threeWeeksAgo = now - FOURTEEN_DAYS_MS - 7 * 24 * 60 * 60 * 1000;

    // Direct insert for precise timestamp control.
    db.prepare(
      `INSERT INTO cooked_history (title, description, cooked_at) VALUES (?, ?, ?)`,
    ).run("Ny ret", "Ny beskrivelse.", now);

    db.prepare(
      `INSERT INTO cooked_history (title, description, cooked_at) VALUES (?, ?, ?)`,
    ).run("14 dage gammel", "Lige på grænsen.", twoWeeksAgo);

    db.prepare(
      `INSERT INTO cooked_history (title, description, cooked_at) VALUES (?, ?, ?)`,
    ).run("Gammel ret", "Tre uger siden.", threeWeeksAgo);

    // Cutoff: 14 days ago.
    const cutoff = now - FOURTEEN_DAYS_MS;

    const recent = repo.listSince(cutoff);
    expect(recent).toHaveLength(2);
    const titles = recent.map((r) => r.title);
    expect(titles).toContain("Ny ret");
    expect(titles).toContain("14 dage gammel");
    expect(titles).not.toContain("Gammel ret");
  });

  test("listSince returns empty array when no meals are in window", () => {
    const db = freshDb();
    const repo = new CookedHistoryRepository(db);

    const now = Date.now();
    const cutoff = now - 14 * 24 * 60 * 60 * 1000;
    expect(repo.listSince(cutoff)).toEqual([]);
  });

  test("listSince returns entries ordered newest first", () => {
    const db = freshDb();
    const repo = new CookedHistoryRepository(db);

    const now = Date.now();
    db.prepare(
      `INSERT INTO cooked_history (title, description, cooked_at) VALUES (?, ?, ?)`,
    ).run("Ældre", "Første ret.", now - 1000);
    db.prepare(
      `INSERT INTO cooked_history (title, description, cooked_at) VALUES (?, ?, ?)`,
    ).run("Nyere", "Anden ret.", now);

    const cutoff = now - 14 * 24 * 60 * 60 * 1000;
    const recent = repo.listSince(cutoff);
    expect(recent).toHaveLength(2);
    expect(recent[0]?.title).toBe("Nyere");
    expect(recent[1]?.title).toBe("Ældre");
  });
});
