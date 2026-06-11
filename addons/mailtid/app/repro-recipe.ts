// Repro for the "Kunne ikke hente opskrift." bug.
// Boots the real app with various LLM failure modes, calls /api/inspiration/recipe,
// checks the HTTP response.

import { Hono } from "hono";
import { createApp } from "./src/server/app.js";
import { MockLLMClient } from "./src/llm/mock.js";
import { RecipeService } from "./src/inspiration/recipe-service.js";
import { InspirationService } from "./src/inspiration/service.js";
import { SeasonalityRepository } from "./src/db/seasonality.js";
import { FilterStateRepository } from "./src/db/filter-state.js";
import { CustomIngredientsRepository } from "./src/db/custom-ingredients.js";
import { ProfileRepository } from "./src/db/profile.js";
import { SettingsRepository } from "./src/db/settings.js";
import { FavouritesRepository } from "./src/db/favourites.js";
import { CookedHistoryRepository } from "./src/db/cooked-history.js";
import { runMigrations } from "./src/db/migrate.js";
import { importSeasonalitySeed } from "./src/db/seed.js";
import Database from "better-sqlite3";

const MEAL_TITLE = "Cremet aspargessuppe";
const MEAL_DESC = "En cremet suppe med friske grønne asparges.";

const CANNED_OK = JSON.stringify({
  title: MEAL_TITLE,
  description: MEAL_DESC,
  ingredients: [
    { name: "Asparges", amount: "500", unit: "g" },
    { name: "Løg", amount: "1", unit: "stk" },
  ],
  steps: ["Skær asparges i stykker og svits med løg.", "Tilsæt bouillon og simre 15 min."],
  time_minutes: 30,
});

interface Scenario {
  name: string;
  cannedResponse: string;
  shouldThrow?: Error;
  activeModel?: string | null;
}

const SCENARIOS: Scenario[] = [
  {
    name: "happy path: valid JSON, model set",
    cannedResponse: CANNED_OK,
    activeModel: "opencode-go/glm-5.1",
  },
  {
    name: "happy path: valid JSON, no model set (uses default)",
    cannedResponse: CANNED_OK,
    activeModel: null,
  },
  {
    name: "LLM throws network error",
    cannedResponse: CANNED_OK,
    shouldThrow: new Error("fetch failed"),
    activeModel: "opencode-go/glm-5.1",
  },
  {
    name: "LLM returns plain text, no JSON",
    cannedResponse: "I'm sorry, I can't help with that.",
    activeModel: "opencode-go/glm-5.1",
  },
  {
    name: "LLM returns JSON wrapped in ```json``` fences",
    cannedResponse: "```json\n" + CANNED_OK + "\n```",
    activeModel: "opencode-go/glm-5.1",
  },
  {
    name: "LLM returns prose + JSON (no fences)",
    cannedResponse: "Her er opskriften:\n" + CANNED_OK + "\nGod fornøjelse!",
    activeModel: "opencode-go/glm-5.1",
  },
  {
    name: "LLM returns JSON missing time_minutes",
    cannedResponse: JSON.stringify({
      title: "Foo",
      description: "Bar",
      ingredients: [{ name: "X", amount: "1", unit: "stk" }],
      steps: ["Gør det."],
    }),
    activeModel: "opencode-go/glm-5.1",
  },
  {
    name: "LLM returns ingredients as strings (common LLM deviation)",
    cannedResponse: JSON.stringify({
      title: "Foo",
      description: "Bar",
      ingredients: ["500 g kartofler", "1 stk løg"],
      steps: ["Gør det."],
      time_minutes: 30,
    }),
    activeModel: "opencode-go/glm-5.1",
  },
  {
    name: "LLM returns empty string",
    cannedResponse: "",
    activeModel: "opencode-go/glm-5.1",
  },
  {
    name: "LLM returns the meal wrapper, not the recipe",
    cannedResponse: JSON.stringify({
      meals: [{ title: "Foo", description: "Bar" }],
    }),
    activeModel: "opencode-go/glm-5.1",
  },
];

async function runScenario(scenario: Scenario) {
  const db = new Database(":memory:");
  runMigrations(db);
  importSeasonalitySeed(db);

  const llm = new MockLLMClient(scenario.cannedResponse);
  if (scenario.shouldThrow) llm.shouldThrow = scenario.shouldThrow;

  const seasonality = new SeasonalityRepository(db);
  const filterState = new FilterStateRepository(db);
  const customIngredients = new CustomIngredientsRepository(db);
  const profile = new ProfileRepository(db);
  const settings = new SettingsRepository(db);
  if (scenario.activeModel !== undefined) {
    if (scenario.activeModel !== null) {
      settings.setActiveModel(scenario.activeModel);
    }
  }
  const favourites = new FavouritesRepository(db);
  const cookedHistory = new CookedHistoryRepository(db);

  const inspiration = new InspirationService(
    seasonality, llm, () => 6,
    { filterState, customIngredients },
    profile, settings, cookedHistory,
  );
  const recipe = new RecipeService(seasonality, llm, () => 6, settings);

  const app = createApp({
    seasonality, filterState, customIngredients, profile,
    settings, favourites, cookedHistory,
    hasApiKey: () => true,
    inspiration, recipe,
    monthProvider: () => 6,
  });

  const res = await app.request("http://localhost/api/inspiration/recipe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: MEAL_TITLE, description: MEAL_DESC }),
  });
  const body = await res.json().catch(() => null);

  return { status: res.status, body, model: llm.models[0] };
}

for (const scenario of SCENARIOS) {
  console.log(`\n=== ${scenario.name} ===`);
  try {
    const result = await runScenario(scenario);
    console.log(`  model passed to LLM: ${result.model}`);
    console.log(`  HTTP status: ${result.status}`);
    console.log(`  body: ${JSON.stringify(result.body).slice(0, 200)}`);
  } catch (err) {
    console.log(`  THREW: ${(err as Error).message}`);
  }
}
