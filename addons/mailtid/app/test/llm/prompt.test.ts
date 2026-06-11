import { describe, expect, test } from "vitest";
import {
  buildShortFormPrompt,
  DANISH_MONTH_NAMES,
  danishMonthName,
  SHORT_FORM_MEAL_COUNT,
} from "../../src/llm/prompt.js";
import type { SeasonalityIngredient } from "../../src/db/seasonality.js";

const JUNE_INGREDIENTS: SeasonalityIngredient[] = [
  { slug: "asparges", nameDa: "Asparges", month: 6 },
  { slug: "jordbaer", nameDa: "Jordbær", month: 6 },
  { slug: "kartofler", nameDa: "Kartofler", month: 6 },
  { slug: "tomat", nameDa: "Tomat", month: 6 },
];

describe("buildShortFormPrompt", () => {
  test("tells the model the current month by Danish name and number", () => {
    const prompt = buildShortFormPrompt(6, JUNE_INGREDIENTS);

    expect(prompt).toContain("Juni");
    expect(prompt).toContain("måned 6");
  });

  test("lists every in-season ingredient by Danish display name", () => {
    const prompt = buildShortFormPrompt(6, JUNE_INGREDIENTS);

    for (const ing of JUNE_INGREDIENTS) {
      expect(prompt, `expected ${ing.nameDa} in prompt`).toContain(ing.nameDa);
    }
  });

  test("instructs the model to feature in-season ingredients as central, with other common ingredients allowed", () => {
    const prompt = buildShortFormPrompt(6, JUNE_INGREDIENTS);

    expect(prompt.toLowerCase()).toMatch(/råvarer fra denne liste som centrale/);
    expect(prompt.toLowerCase()).toMatch(/supplere med andre almindelige/);
  });

  test("asks for exactly 6 short-form Meal Inspirations with full recipe data", () => {
    const prompt = buildShortFormPrompt(6, JUNE_INGREDIENTS);

    expect(prompt).toContain(String(SHORT_FORM_MEAL_COUNT));
    expect(prompt).toContain("meals");
    expect(prompt).toContain("title");
    expect(prompt).toContain("description");
    expect(prompt).toContain("ingredients");
    expect(prompt).toContain("steps");
    expect(prompt).toContain("time_minutes");
    expect(prompt).toContain("amount");
    expect(prompt).toContain("unit");
  });

  test("requires JSON output (no markdown, no code blocks)", () => {
    const prompt = buildShortFormPrompt(6, JUNE_INGREDIENTS);

    expect(prompt).toContain("JSON");
    expect(prompt.toLowerCase()).toContain("uden markdown");
  });

  test("is in Danish — Danish task words are present, English are not", () => {
    const prompt = buildShortFormPrompt(6, JUNE_INGREDIENTS);

    expect(prompt).toContain("Opgave");
    expect(prompt).toContain("Sprog");
    expect(prompt).toContain("Måned");
    expect(prompt).toContain("Råvarer");
    expect(prompt).toContain("Outputformat");
    expect(prompt).not.toContain("Task");
    expect(prompt).not.toContain("Output format");
  });

  test("includes # Tænkning reasoning instruction after filter section", () => {
    const prompt = buildShortFormPrompt(6, JUNE_INGREDIENTS);

    expect(prompt).toContain("# Tænkning");
    expect(prompt).toContain("tænk grundigt igennem");
    expect(prompt).toContain("JSON-svar");
  });

  test("Tænkning section appears after Filtreringskrav when filter is active", () => {
    const prompt = buildShortFormPrompt(6, JUNE_INGREDIENTS, {
      inSeasonIncludes: [{ slug: "asparges", nameDa: "Asparges" }],
      customMandatory: [],
      excludes: [],
    });

    const filterIdx = prompt.indexOf("# Filtreringskrav");
    const thinkIdx = prompt.indexOf("# Tænkning");
    expect(filterIdx).toBeGreaterThan(-1);
    expect(thinkIdx).toBeGreaterThan(filterIdx);
  });
});

describe("danishMonthName", () => {
  test("returns the Danish name for a valid month", () => {
    for (let m = 1; m <= 12; m++) {
      expect(danishMonthName(m)).toBe(DANISH_MONTH_NAMES[m - 1]);
    }
  });

  test("throws for an out-of-range month", () => {
    expect(() => danishMonthName(0)).toThrow();
    expect(() => danishMonthName(13)).toThrow();
    expect(() => danishMonthName(1.5)).toThrow();
  });
});
