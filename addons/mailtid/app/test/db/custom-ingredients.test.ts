import { describe, expect, test } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../../src/db/migrate.js";
import {
  CustomIngredientsRepository,
  slugifyCustomIngredient,
} from "../../src/db/custom-ingredients.js";

function freshRepo(): CustomIngredientsRepository {
  const db = new Database(":memory:");
  runMigrations(db);
  return new CustomIngredientsRepository(db);
}

describe("CustomIngredientsRepository", () => {
  test("list() returns an empty array when nothing has been added", () => {
    const repo = freshRepo();

    expect(repo.list()).toEqual([]);
  });

  test("add() stores a custom mandatory ingredient and list() returns it", () => {
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

    repo.add("  Ris  ");

    expect(repo.list()[0]?.nameDa).toBe("Ris");
  });

  test("add() rejects empty or whitespace-only names", () => {
    const repo = freshRepo();

    expect(() => repo.add("")).toThrow();
    expect(() => repo.add("   ")).toThrow();
  });

  test("remove() deletes a previously added ingredient", () => {
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
    repo.add("Tomatpuré");

    expect(repo.list().map((i) => i.nameDa)).toEqual([
      "Ris",
      "Løg",
      "Tomatpuré",
    ]);
  });

  test("add() returns the stored { slug, nameDa } entry", () => {
    const repo = freshRepo();

    const stored = repo.add("Ris");

    expect(stored).toEqual({ slug: "ris", nameDa: "Ris" });
  });
});

describe("slugifyCustomIngredient", () => {
  test("lowercases ASCII input", () => {
    expect(slugifyCustomIngredient("Ris")).toBe("ris");
  });

  test("preserves Danish letters in the slug", () => {
    expect(slugifyCustomIngredient("Grøntsags-bouillon")).toBe(
      "grøntsags-bouillon",
    );
  });

  test("replaces whitespace with a single dash", () => {
    expect(slugifyCustomIngredient("Rød  vin")).toBe("rød-vin");
  });

  test("strips leading and trailing dashes", () => {
    expect(slugifyCustomIngredient("  Ris  ")).toBe("ris");
  });
});
