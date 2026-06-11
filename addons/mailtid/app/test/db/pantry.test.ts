import { describe, expect, test } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../../src/db/migrate.js";
import {
  PantryRepository,
  slugifyPantryItem,
} from "../../src/db/pantry.js";

function freshRepo(): PantryRepository {
  const db = new Database(":memory:");
  runMigrations(db);
  return new PantryRepository(db);
}

describe("PantryRepository", () => {
  test("list() returns an empty array when nothing has been added", () => {
    const repo = freshRepo();

    expect(repo.list()).toEqual([]);
  });

  test("add() stores a pantry item and list() returns it", () => {
    const repo = freshRepo();

    repo.add("Ris");

    const items = repo.list();
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({ slug: "ris", nameDa: "Ris" });
  });

  test("add() is idempotent on the same input name", () => {
    const repo = freshRepo();

    repo.add("Ris");
    repo.add("ris");
    repo.add("RIS");

    expect(repo.list()).toHaveLength(1);
  });

  test("add() normalises the display name's leading/trailing whitespace", () => {
    const repo = freshRepo();

    repo.add("  Olie  ");

    expect(repo.list()[0]?.nameDa).toBe("Olie");
  });

  test("add() rejects empty or whitespace-only names", () => {
    const repo = freshRepo();

    expect(() => repo.add("")).toThrow();
    expect(() => repo.add("   ")).toThrow();
  });

  test("remove() deletes a previously added pantry item", () => {
    const repo = freshRepo();
    repo.add("Ris");

    repo.remove("ris");

    expect(repo.list()).toEqual([]);
  });

  test("remove() on a missing slug is a no-op", () => {
    const repo = freshRepo();

    expect(() => repo.remove("ris")).not.toThrow();
  });

  test("list() returns items in insertion order (oldest first)", () => {
    const repo = freshRepo();

    repo.add("Ris");
    repo.add("Løg");
    repo.add("Olie");

    expect(repo.list().map((i) => i.nameDa)).toEqual([
      "Ris",
      "Løg",
      "Olie",
    ]);
  });

  test("add() returns the stored { slug, nameDa } entry", () => {
    const repo = freshRepo();

    const stored = repo.add("Olie");

    expect(stored).toEqual({ slug: "olie", nameDa: "Olie" });
  });
});

describe("slugifyPantryItem", () => {
  test("lowercases ASCII input", () => {
    expect(slugifyPantryItem("Salt")).toBe("salt");
  });

  test("preserves Danish letters in the slug", () => {
    expect(slugifyPantryItem("Grøntsags-bouillon")).toBe(
      "grøntsags-bouillon",
    );
  });

  test("replaces whitespace with a single dash", () => {
    expect(slugifyPantryItem("Oliven olie")).toBe("oliven-olie");
  });

  test("strips leading and trailing dashes", () => {
    expect(slugifyPantryItem("  Ris  ")).toBe("ris");
  });
});
