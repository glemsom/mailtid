import { describe, expect, test } from "vitest";
import { buildRecipePrompt } from "../../src/llm/recipe-prompt.js";
import type { SeasonalityIngredient } from "../../src/db/seasonality.js";
import type { MealInspiration } from "../../src/inspiration/service.js";

const JUNE_INGREDIENTS: SeasonalityIngredient[] = [
  { slug: "asparges", nameDa: "Asparges", month: 6 },
  { slug: "jordbaer", nameDa: "Jordbær", month: 6 },
  { slug: "kartofler", nameDa: "Kartofler", month: 6 },
];

const MEAL: MealInspiration = {
  title: "Aspargessuppe",
  description: "Cremet suppe med grønne asparges.",
};

describe("buildRecipePrompt", () => {
  test("includes the meal's title and description in the Måltid section", () => {
    const prompt = buildRecipePrompt(MEAL, JUNE_INGREDIENTS);

    expect(prompt).toContain("Aspargessuppe");
    expect(prompt).toContain("Cremet suppe med grønne asparges.");
  });

  test("lists every in-season ingredient by Danish display name", () => {
    const prompt = buildRecipePrompt(MEAL, JUNE_INGREDIENTS);

    for (const ing of JUNE_INGREDIENTS) {
      expect(prompt, `expected ${ing.nameDa} in prompt`).toContain(ing.nameDa);
    }
  });

  test("asks the model to return ingredients, steps, and time_minutes", () => {
    const prompt = buildRecipePrompt(MEAL, JUNE_INGREDIENTS);

    expect(prompt).toContain("ingredients");
    expect(prompt).toContain("steps");
    expect(prompt).toContain("time_minutes");
    expect(prompt).toContain("amount");
    expect(prompt).toContain("unit");
  });

  test("is in Danish — Danish task words are present, English are not", () => {
    const prompt = buildRecipePrompt(MEAL, JUNE_INGREDIENTS);

    expect(prompt).toContain("Opgave");
    expect(prompt).toContain("Sprog");
    expect(prompt).toContain("Måltid");
    expect(prompt).toContain("Råvarer");
    expect(prompt).toContain("Outputformat");
    expect(prompt).not.toContain("Task");
    expect(prompt).not.toContain("Ingredients");
  });

  test("requires JSON output (no markdown, no code blocks)", () => {
    const prompt = buildRecipePrompt(MEAL, JUNE_INGREDIENTS);

    expect(prompt).toContain("JSON");
    expect(prompt.toLowerCase()).toContain("uden markdown");
  });
});
