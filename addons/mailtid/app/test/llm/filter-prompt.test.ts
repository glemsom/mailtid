import { describe, expect, test } from "vitest";
import {
  buildShortFormPrompt,
  type ShortFormFilter,
} from "../../src/llm/prompt.js";
import type { SeasonalityIngredient } from "../../src/db/seasonality.js";

const JUNE_INGREDIENTS: SeasonalityIngredient[] = [
  { slug: "asparges", nameDa: "Asparges", month: 6 },
  { slug: "jordbaer", nameDa: "Jordbær", month: 6 },
  { slug: "kartofler", nameDa: "Kartofler", month: 6 },
  { slug: "tomat", nameDa: "Tomat", month: 6 },
];

const EMPTY_FILTER: ShortFormFilter = {
  inSeasonIncludes: [],
  customMandatory: [],
  excludes: [],
};

describe("buildShortFormPrompt with filter", () => {
  test("an empty filter does not add a filter section to the prompt", () => {
    const prompt = buildShortFormPrompt(6, JUNE_INGREDIENTS, EMPTY_FILTER);

    expect(prompt.toLowerCase()).not.toContain("filtrering");
  });

  test("in-season includes are listed under a single OR section", () => {
    const filter: ShortFormFilter = {
      ...EMPTY_FILTER,
      inSeasonIncludes: [
        { slug: "asparges", nameDa: "Asparges" },
        { slug: "jordbaer", nameDa: "Jordbær" },
      ],
    };
    const prompt = buildShortFormPrompt(6, JUNE_INGREDIENTS, filter);

    expect(prompt).toContain("Asparges");
    expect(prompt).toContain("Jordbær");
    // OR semantics: at least one of these.
    expect(prompt.toLowerCase()).toMatch(/mindst .*af/);
  });

  test("custom mandatory ingredients are listed with AND semantics (must contain all)", () => {
    const filter: ShortFormFilter = {
      ...EMPTY_FILTER,
      customMandatory: ["Ris", "Løg"],
    };
    const prompt = buildShortFormPrompt(6, JUNE_INGREDIENTS, filter);

    expect(prompt).toContain("Ris");
    expect(prompt).toContain("Løg");
    expect(prompt.toLowerCase()).toMatch(/skal indeholde/);
  });

  test("excludes are listed with AND semantics (must not contain any)", () => {
    const filter: ShortFormFilter = {
      ...EMPTY_FILTER,
      excludes: [
        { slug: "champignon", nameDa: "Champignon" },
        { slug: "tomat", nameDa: "Tomat" },
      ],
    };
    const prompt = buildShortFormPrompt(6, JUNE_INGREDIENTS, filter);

    expect(prompt).toContain("Champignon");
    expect(prompt).toContain("Tomat");
    expect(prompt.toLowerCase()).toMatch(/må ikke indeholde/);
  });

  test("all three filter sections can be present at once and are clearly separated", () => {
    const filter: ShortFormFilter = {
      inSeasonIncludes: [{ slug: "asparges", nameDa: "Asparges" }],
      customMandatory: ["Ris"],
      excludes: [{ slug: "champignon", nameDa: "Champignon" }],
    };
    const prompt = buildShortFormPrompt(6, JUNE_INGREDIENTS, filter);

    expect(prompt).toContain("Asparges");
    expect(prompt).toContain("Ris");
    expect(prompt).toContain("Champignon");
    // Three semantic labels, one per section.
    expect(prompt.toLowerCase()).toMatch(/mindst .*af/);
    expect(prompt.toLowerCase()).toMatch(/skal indeholde/);
    expect(prompt.toLowerCase()).toMatch(/må ikke indeholde/);
  });

  test("the three filter lists are independent — including one does not mention the other two", () => {
    const includesOnly: ShortFormFilter = {
      inSeasonIncludes: [{ slug: "asparges", nameDa: "Asparges" }],
      customMandatory: [],
      excludes: [],
    };
    const prompt = buildShortFormPrompt(6, JUNE_INGREDIENTS, includesOnly);

    // Ris is not in the custom mandatory list of the includes-only
    // filter, so it must not appear in the filter section.
    expect(prompt).not.toMatch(/skal indeholde[^]*Ris/);
    expect(prompt).not.toMatch(/må ikke indeholde/);
  });
});
