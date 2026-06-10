import { describe, expect, test } from "vitest";
import {
  buildShortFormPrompt,
  SHORT_FORM_MEAL_COUNT,
} from "../../src/llm/prompt.js";
import type { SeasonalityIngredient } from "../../src/db/seasonality.js";

const JUNE_INGREDIENTS: SeasonalityIngredient[] = [
  { slug: "asparges", nameDa: "Asparges", month: 6 },
  { slug: "jordbaer", nameDa: "Jordbær", month: 6 },
  { slug: "kartofler", nameDa: "Kartofler", month: 6 },
  { slug: "tomat", nameDa: "Tomat", month: 6 },
];

describe("buildShortFormPrompt — cooked history", () => {
  test("includes cooked-history section when cookedTitles is non-empty", () => {
    const prompt = buildShortFormPrompt(6, JUNE_INGREDIENTS, undefined, undefined, [
      "Jordbærtærte",
      "Aspargessuppe",
    ]);

    expect(prompt).toContain("Tidligere lavet");
    expect(prompt).toContain("Jordbærtærte");
    expect(prompt).toContain("Aspargessuppe");
    expect(prompt).toContain("undgå");
  });

  test("omits cooked-history section when cookedTitles is empty", () => {
    const prompt = buildShortFormPrompt(6, JUNE_INGREDIENTS, undefined, undefined, []);

    expect(prompt).not.toContain("Tidligere lavet");
  });

  test("omits cooked-history section when cookedTitles is undefined", () => {
    const prompt = buildShortFormPrompt(6, JUNE_INGREDIENTS);

    expect(prompt).not.toContain("Tidligere lavet");
  });

  test("cooked-history section appears after profile but before filter", () => {
    const prompt = buildShortFormPrompt(
      6,
      JUNE_INGREDIENTS,
      {
        inSeasonIncludes: [{ slug: "asparges", nameDa: "Asparges" }],
        customMandatory: [],
        excludes: [],
      },
      {
        dietaryPattern: "omnivore",
        allergies: [],
        dislikes: "",
      },
      ["Jordbærtærte"],
    );

    const profileIdx = prompt.indexOf("Kostprofil");
    const cookedIdx = prompt.indexOf("Tidligere lavet");
    const filterIdx = prompt.indexOf("Filtreringskrav");

    expect(profileIdx).toBeGreaterThan(-1);
    expect(cookedIdx).toBeGreaterThan(-1);
    expect(filterIdx).toBeGreaterThan(-1);
    // Cooked history between profile and filter.
    expect(cookedIdx).toBeGreaterThan(profileIdx);
    expect(cookedIdx).toBeLessThan(filterIdx);
  });
});
