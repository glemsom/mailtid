/**
 * Reproduction script: model-selection silently failing.
 *
 * Simulates the real user scenario:
 *  1. Settings page renders with models cached but NO activeModel set.
 *  2. Browser auto-selects the first <option> (no "selected" attribute).
 *  3. User sees a model in the dropdown — thinks it's selected.
 *  4. User never interacts with the dropdown → "change" event NEVER fires.
 *  5. User clicks "Vis 5 nye" on home page.
 *  6. getActiveModel() returns null → default model is used.
 */

import Database from "better-sqlite3";
import { runMigrations } from "./src/db/migrate.js";
import { importSeasonalitySeed } from "./src/db/seed.js";
import { SeasonalityRepository } from "./src/db/seasonality.js";
import { FilterStateRepository } from "./src/db/filter-state.js";
import { CustomIngredientsRepository } from "./src/db/custom-ingredients.js";
import { ProfileRepository } from "./src/db/profile.js";
import { SettingsRepository } from "./src/db/settings.js";
import { FavouritesRepository } from "./src/db/favourites.js";
import { CookedHistoryRepository } from "./src/db/cooked-history.js";
import { CachedMealsRepository } from "./src/db/cached-meals.js";
import { MockLLMClient } from "./src/llm/mock.js";
import { InspirationService } from "./src/inspiration/service.js";
import { RecipeService } from "./src/inspiration/recipe-service.js";
import { createApp } from "./src/server/app.js";

const CANNED = JSON.stringify({
  meals: [
    { title: "T1", description: "D1", ingredients: [{ name: "X", amount: "1", unit: "stk" }], steps: ["Gør klar."], time_minutes: 10 },
    { title: "T2", description: "D2", ingredients: [{ name: "X", amount: "1", unit: "stk" }], steps: ["Gør klar."], time_minutes: 10 },
    { title: "T3", description: "D3", ingredients: [{ name: "X", amount: "1", unit: "stk" }], steps: ["Gør klar."], time_minutes: 10 },
    { title: "T4", description: "D4", ingredients: [{ name: "X", amount: "1", unit: "stk" }], steps: ["Gør klar."], time_minutes: 10 },
    { title: "T5", description: "D5", ingredients: [{ name: "X", amount: "1", unit: "stk" }], steps: ["Gør klar."], time_minutes: 10 },
  ],
});

const db = new Database(":memory:");
runMigrations(db);
importSeasonalitySeed(db);

const seasonality = new SeasonalityRepository(db);
const filterState = new FilterStateRepository(db);
const customIngredients = new CustomIngredientsRepository(db);
const profile = new ProfileRepository(db);
const settings = new SettingsRepository(db);
const favourites = new FavouritesRepository(db);
const cookedHistory = new CookedHistoryRepository(db);
const cachedMeals = new CachedMealsRepository(db);
const llm = new MockLLMClient(CANNED);

// Seed model cache with 3 models (simulating a refreshed catalogue)
settings.replaceModelCache([
  { modelId: "opencode-go/glm-5.1", displayName: "GLM 5.1", tier: "free" as const },
  { modelId: "opencode-go/gpt-4o-mini", displayName: "GPT-4o Mini", tier: "paid" as const },
  { modelId: "opencode-go/deepseek-v4", displayName: "DeepSeek V4", tier: "free" as const },
]);

// --- SCENARIO 1: User opens settings, sees first model shown, clicks home & "Vis 5 nye" ---

console.log("\n=== SCENARIO 1: No active model set, browser auto-selects first option ===");
console.log("Active model before:", settings.getActiveModel());

const inspiration = new InspirationService(
  seasonality, llm, () => 6,
  { filterState, customIngredients },
  profile, settings, cookedHistory,
);
const recipe = new RecipeService(seasonality, llm, () => 6, settings);

const app = createApp({
  seasonality, filterState, customIngredients, profile,
  settings, favourites, cookedHistory, cachedMeals,
  hasApiKey: () => true,
  inspiration, recipe,
  monthProvider: () => 6,
});

// User clicks "Vis 5 nye" — what model is actually used?
await app.request("/api/inspiration", { method: "POST" });
console.log("Model passed to LLM:", llm.models[0] ?? "<undefined → falls back to default>");

// --- SCENARIO 2: User explicitly selects a model via settings page ---
llm.models.length = 0;
llm.prompts.length = 0;

console.log("\n=== SCENARIO 2: User selects model via PUT /api/settings, then clicks Vis 5 nye ===");
const putRes = await app.request("/api/settings", {
  method: "PUT",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ activeModel: "opencode-go/gpt-4o-mini" }),
});
console.log("PUT /api/settings status:", putRes.status);
console.log("Active model after PUT:", settings.getActiveModel());

await app.request("/api/inspiration", { method: "POST" });
console.log("Model passed to LLM:", llm.models[0]);

// --- SCENARIO 3: Active model not in cached list (model was removed from API) ---
llm.models.length = 0;
llm.prompts.length = 0;

console.log("\n=== SCENARIO 3: Active model in SQLite but NOT in cached list ===");
settings.setActiveModel("opencode-go/old-deprecated-model");
const settingsHtml = await app.request("/indstillinger");
const html = await settingsHtml.text();
const hasSelected = html.includes("selected");
const hasOldModel = html.includes("old-deprecated-model");
console.log("Settings page has 'selected' attr:", hasSelected);
console.log("Settings page contains old model:", hasOldModel);
console.log("Active model in SQLite:", settings.getActiveModel());
// The settings page would show the FIRST cached model as selected
// because NO option matches the old activeModel
// Browser auto-selects first option, NO change event fires
// User sees "GLM 5.1" selected but SQLite still has "old-deprecated-model"

await app.request("/api/inspiration", { method: "POST" });
console.log("Model passed to LLM:", llm.models[0]);

// --- SCENARIO 4: What if there's an error in PUT /api/settings? ---
console.log("\n=== SCENARIO 4: PUT /api/settings with empty model (simulating empty select) ===");
const badPutRes = await app.request("/api/settings", {
  method: "PUT",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ activeModel: "" }),
});
console.log("PUT response status:", badPutRes.status);
const badBody = await badPutRes.json();
console.log("PUT response body:", badBody);
// The settings page JS shows NO error when res.ok is false!
console.log("BUG: settings page JS shows no error when save fails — user thinks it worked");

// Summary
console.log("\n=== SUMMARY ===");
console.log("Scenario 1 — no active model, browser auto-select: user sees model but it's never saved");
console.log("Scenario 2 — explicit save: works correctly");
console.log("Scenario 3 — stale active model, no longer in cache: old model silently persists");
console.log("Scenario 4 — save fails silently: user gets no error feedback");
