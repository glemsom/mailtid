import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * Pure-data invariants for the curated Danish in-season dataset.
 *
 * The dataset lives at `addons/mailtid/app/data/seasonality.json` and
 * is the source of truth for "what is in season this month" in
 * Mailtid. These tests guard the shape of that file: it has to
 * parse, have the right structure, contain enough ingredients to
 * drive the LLM prompt, and be ordered such that every month's
 * projection is alphabetical (so a reviewer reading the file can
 * scan a single month without jumping around).
 *
 * See issue #2 for the acceptance criteria that drove this list.
 */

interface Ingredient {
  slug: string;
  name_da: string;
  months: number[];
}

interface SeasonalityFile {
  ingredients: Ingredient[];
}

const DATA_PATH = resolve(__dirname, "../../data/seasonality.json");

function loadDataset(): SeasonalityFile {
  const raw = readFileSync(DATA_PATH, "utf8");
  return JSON.parse(raw) as SeasonalityFile;
}

describe("seasonality.json", () => {
  test("exists at addons/mailtid/app/data/seasonality.json and parses as JSON", () => {
    const raw = readFileSync(DATA_PATH, "utf8");
    // Should not throw, and should produce an object.
    const parsed: unknown = JSON.parse(raw);
    expect(parsed).toBeTypeOf("object");
  });

  test("has the expected top-level shape: { ingredients: [...] }", () => {
    const data = loadDataset();
    expect(data).toBeTypeOf("object");
    expect(Array.isArray(data.ingredients)).toBe(true);
  });

  test("every entry has slug, name_da, and months fields of the right types", () => {
    const data = loadDataset();
    for (const ing of data.ingredients) {
      expect(typeof ing.slug, "ing.slug").toBe("string");
      expect(ing.slug.length, "ing.slug non-empty").toBeGreaterThan(0);
      expect(typeof ing.name_da, "ing.name_da").toBe("string");
      expect(ing.name_da.length, "ing.name_da non-empty").toBeGreaterThan(0);
      expect(Array.isArray(ing.months), "ing.months").toBe(true);
    }
  });

  test("contains at least 60 ingredients (target ~80)", () => {
    const data = loadDataset();
    expect(data.ingredients.length).toBeGreaterThanOrEqual(60);
  });

  test("slugs are unique across all ingredients", () => {
    const data = loadDataset();
    const slugs = data.ingredients.map((i) => i.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  test("slugs are lowercase ASCII (letters, digits, underscore, hyphen)", () => {
    const data = loadDataset();
    const slugPattern = /^[a-z0-9_-]+$/;
    for (const ing of data.ingredients) {
      expect(ing.slug, ing.slug).toMatch(slugPattern);
    }
  });

  test("every months value is an integer in the range 1-12", () => {
    const data = loadDataset();
    for (const ing of data.ingredients) {
      for (const m of ing.months) {
        expect(Number.isInteger(m), `${ing.slug} months: ${JSON.stringify(ing.months)}`).toBe(true);
        expect(m, `${ing.slug} months: ${JSON.stringify(ing.months)}`).toBeGreaterThanOrEqual(1);
        expect(m, `${ing.slug} months: ${JSON.stringify(ing.months)}`).toBeLessThanOrEqual(12);
      }
    }
  });

  test("name_da is title-cased: every space-separated word starts with an uppercase letter and the rest are lowercase (Danish diacritics allowed)", () => {
    const data = loadDataset();
    const titleCasedWord = /^[A-ZÆØÅ][a-zæøåé]*$/;
    for (const ing of data.ingredients) {
      const words = ing.name_da.split(" ");
      for (const word of words) {
        expect(word, `${ing.slug}: "${ing.name_da}"`).toMatch(titleCasedWord);
      }
    }
  });

  test("every month (1-12) has at least 10 ingredients in season", () => {
    const data = loadDataset();
    for (let m = 1; m <= 12; m++) {
      const inMonth = data.ingredients.filter((i) => i.months.includes(m));
      expect(
        inMonth.length,
        `month ${m}: expected at least 10 ingredients, got ${inMonth.length}`,
      ).toBeGreaterThanOrEqual(10);
    }
  });

  test("ingredients are alphabetical (Danish collation) within each month", () => {
    const data = loadDataset();
    for (let m = 1; m <= 12; m++) {
      const inMonth = data.ingredients.filter((i) => i.months.includes(m));
      const sorted = [...inMonth].sort((a, b) =>
        a.name_da.localeCompare(b.name_da, "da"),
      );
      const actualNames = inMonth.map((i) => i.name_da);
      const sortedNames = sorted.map((i) => i.name_da);
      expect(actualNames, `month ${m} order`).toEqual(sortedNames);
    }
  });
});
