import { describe, expect, test } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../../src/db/migrate.js";
import { importSeasonalitySeed } from "../../src/db/seed.js";
import { SeasonalityRepository } from "../../src/db/seasonality.js";
import { MockLLMClient } from "../../src/llm/mock.js";
import {
  RecipeService,
  parseRecipeResponse,
  type FullRecipe,
} from "../../src/inspiration/recipe-service.js";
import type { MealInspiration } from "../../src/inspiration/service.js";

function makeService(opts: {
  cannedResponse: string;
  month: number;
}): { service: RecipeService; llm: MockLLMClient } {
  const db = new Database(":memory:");
  runMigrations(db);
  importSeasonalitySeed(db);
  const repo = new SeasonalityRepository(db);
  const llm = new MockLLMClient(opts.cannedResponse);
  const service = new RecipeService(repo, llm, () => opts.month);
  return { service, llm };
}

const MEAL: MealInspiration = {
  title: "Aspargessuppe",
  description: "Cremet suppe med grønne asparges.",
};

/**
 * The shape the LLM is asked to produce — what the parser consumes
 * and what the LLM should return. The TypeScript `FullRecipe` uses
 * `timeMinutes` (camelCase); the on-the-wire JSON from the LLM uses
 * `time_minutes` (snake_case), matching the prompt's example.
 */
interface WireRecipe {
  title: string;
  description: string;
  ingredients: { name: string; amount: string; unit: string }[];
  steps: string[];
  time_minutes: number;
}

const CANNED_WIRE: WireRecipe = {
  title: "Cremet aspargessuppe",
  description: "En cremet suppe med friske grønne asparges.",
  ingredients: [
    { name: "Grønne asparges", amount: "500", unit: "g" },
    { name: "Løg", amount: "1", unit: "stk" },
    { name: "Fløde", amount: "2", unit: "dl" },
    { name: "Grøntsagsbouillon", amount: "5", unit: "dl" },
  ],
  steps: [
    "Skær asparges i stykker og svits dem med løg i en gryde.",
    "Tilsæt bouillon og lad simre i 15 minutter.",
    "Blend suppen og rør fløden i.",
  ],
  time_minutes: 30,
};

const CANNED_RECIPE: FullRecipe = {
  title: "Cremet aspargessuppe",
  description: "En cremet suppe med friske grønne asparges.",
  ingredients: [
    { name: "Grønne asparges", amount: "500", unit: "g" },
    { name: "Løg", amount: "1", unit: "stk" },
    { name: "Fløde", amount: "2", unit: "dl" },
    { name: "Grøntsagsbouillon", amount: "5", unit: "dl" },
  ],
  steps: [
    "Skær asparges i stykker og svits dem med løg i en gryde.",
    "Tilsæt bouillon og lad simre i 15 minutter.",
    "Blend suppen og rør fløden i.",
  ],
  timeMinutes: 30,
};

const WIRE_JSON = JSON.stringify(CANNED_WIRE);

describe("RecipeService.fullRecipe", () => {
  test("returns a full recipe for the given short-form meal", async () => {
    const { service } = makeService({
      cannedResponse: WIRE_JSON,
      month: 6,
    });

    const recipe = await service.fullRecipe(MEAL);

    expect(recipe.title).toBe("Cremet aspargessuppe");
    expect(recipe.ingredients).toHaveLength(4);
    expect(recipe.ingredients[0]?.name).toBe("Grønne asparges");
    expect(recipe.ingredients[0]?.amount).toBe("500");
    expect(recipe.ingredients[0]?.unit).toBe("g");
    expect(recipe.steps).toHaveLength(3);
    expect(recipe.timeMinutes).toBe(30);
  });

  test("sends a prompt to the LLM that names the meal and the in-season ingredients", async () => {
    const { service, llm } = makeService({
      cannedResponse: WIRE_JSON,
      month: 6,
    });

    await service.fullRecipe(MEAL);

    expect(llm.prompts).toHaveLength(1);
    const prompt = llm.prompts[0] ?? "";
    expect(prompt).toContain("Aspargessuppe");
    expect(prompt).toContain("Cremet suppe med grønne asparges.");
    // Spot-check: an in-season June ingredient is in the prompt.
    expect(prompt).toContain("Asparges");
  });
});

describe("parseRecipeResponse", () => {
  test("parses a well-formed JSON object", () => {
    const parsed = parseRecipeResponse(WIRE_JSON);
    expect(parsed.title).toBe(CANNED_RECIPE.title);
    expect(parsed.ingredients).toHaveLength(4);
    expect(parsed.timeMinutes).toBe(30);
  });

  test("strips ```json fences if the model added them", () => {
    const wrapped = "```json\n" + WIRE_JSON + "\n```";
    expect(parseRecipeResponse(wrapped).title).toBe(CANNED_RECIPE.title);
  });

  test("ignores prose before/after the JSON object", () => {
    const wrapped =
      "Her er opskriften:\n" + WIRE_JSON + "\nGod fornøjelse!";
    expect(parseRecipeResponse(wrapped).title).toBe(CANNED_RECIPE.title);
  });

  test("throws when the response is missing the ingredients array", () => {
    expect(() => parseRecipeResponse(JSON.stringify({ title: "X" }))).toThrow();
  });

  test("throws when an ingredient is missing name, amount, or unit", () => {
    const bad = JSON.stringify({
      ...CANNED_WIRE,
      ingredients: [{ name: "Asparges", amount: "500" }],
    });
    expect(() => parseRecipeResponse(bad)).toThrow();
  });

  test("throws when steps is empty", () => {
    const bad = JSON.stringify({ ...CANNED_WIRE, steps: [] });
    expect(() => parseRecipeResponse(bad)).toThrow();
  });

  test("throws when time_minutes is not a positive integer", () => {
    const bad = JSON.stringify({ ...CANNED_WIRE, time_minutes: 0 });
    expect(() => parseRecipeResponse(bad)).toThrow();
  });

  test("throws on garbage input", () => {
    expect(() => parseRecipeResponse("not json at all")).toThrow();
  });
});
