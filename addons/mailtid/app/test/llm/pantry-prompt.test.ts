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
  pantry: [],
};

describe("buildShortFormPrompt with pantry (basisvarer)", () => {
  test("pantry items are rendered as AND alongside custom mandatory ingredients", () => {
    const filter: ShortFormFilter = {
      ...EMPTY_FILTER,
      customMandatory: ["Ris"],
      pantry: ["Salt", "Olie"],
    };
    const prompt = buildShortFormPrompt(6, JUNE_INGREDIENTS, filter);

    expect(prompt).toContain("Ris");
    expect(prompt).toContain("Salt");
    expect(prompt).toContain("Olie");
    // All three should be under the "Skal indeholde" AND section.
    expect(prompt.toLowerCase()).toMatch(/skal indeholde/);
    expect(prompt).toContain("Basisvarer");
  });

  test("pantry section is omitted when pantry list is empty", () => {
    const filter: ShortFormFilter = {
      ...EMPTY_FILTER,
      customMandatory: ["Ris"],
      pantry: [],
    };
    const prompt = buildShortFormPrompt(6, JUNE_INGREDIENTS, filter);

    expect(prompt).not.toContain("Basisvarer");
    expect(prompt).not.toMatch(/altid på lager/);
  });

  test("pantry items appear even when customMandatory is empty", () => {
    const filter: ShortFormFilter = {
      ...EMPTY_FILTER,
      customMandatory: [],
      pantry: ["Olie"],
    };
    const prompt = buildShortFormPrompt(6, JUNE_INGREDIENTS, filter);

    expect(prompt).toContain("# Filtreringskrav");
    expect(prompt).toContain("Olie");
    expect(prompt).toContain("Basisvarer");
    // Still must-contain AND semantics.
    expect(prompt.toLowerCase()).toMatch(/skal indeholde/);
  });

  test("pantry items and custom mandatory items are listed together in the AND section", () => {
    const filter: ShortFormFilter = {
      ...EMPTY_FILTER,
      customMandatory: ["Ris", "Løg"],
      pantry: ["Salt", "Olie", "Peber"],
    };
    const prompt = buildShortFormPrompt(6, JUNE_INGREDIENTS, filter);

    // All five should appear.
    expect(prompt).toContain("Ris");
    expect(prompt).toContain("Løg");
    expect(prompt).toContain("Salt");
    expect(prompt).toContain("Olie");
    expect(prompt).toContain("Peber");
    // Combined AND semantics.
    expect(prompt.toLowerCase()).toMatch(/skal indeholde/);
  });
});
