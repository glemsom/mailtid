import { describe, expect, test } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../../src/db/migrate.js";
import { importSeasonalitySeed } from "../../src/db/seed.js";
import { SeasonalityRepository } from "../../src/db/seasonality.js";
import { FilterStateRepository } from "../../src/db/filter-state.js";
import { CustomIngredientsRepository } from "../../src/db/custom-ingredients.js";
import { ProfileRepository } from "../../src/db/profile.js";
import { SettingsRepository } from "../../src/db/settings.js";
import { FavouritesRepository } from "../../src/db/favourites.js";
import { CookedHistoryRepository } from "../../src/db/cooked-history.js";
import { MockLLMClient } from "../../src/llm/mock.js";
import { InspirationService } from "../../src/inspiration/service.js";
import { RecipeService } from "../../src/inspiration/recipe-service.js";
import { createApp } from "../../src/server/app.js";

const CANNED = JSON.stringify({
  meals: [
    { title: "T1", description: "D1", ingredients: [{ name: "X", amount: "1", unit: "stk" }], steps: ["Gør klar."], time_minutes: 10 },
    { title: "T2", description: "D2", ingredients: [{ name: "X", amount: "1", unit: "stk" }], steps: ["Gør klar."], time_minutes: 10 },
    { title: "T3", description: "D3", ingredients: [{ name: "X", amount: "1", unit: "stk" }], steps: ["Gør klar."], time_minutes: 10 },
    { title: "T4", description: "D4", ingredients: [{ name: "X", amount: "1", unit: "stk" }], steps: ["Gør klar."], time_minutes: 10 },
    { title: "T5", description: "D5", ingredients: [{ name: "X", amount: "1", unit: "stk" }], steps: ["Gør klar."], time_minutes: 10 },
    { title: "T6", description: "D6", ingredients: [{ name: "X", amount: "1", unit: "stk" }], steps: ["Gør klar."], time_minutes: 10 },
  ],
});

describe("Model selection end-to-end", () => {
  test("PUT /api/settings → POST /api/inspiration threads the saved model", async () => {
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
    const llm = new MockLLMClient(CANNED);
    const inspiration = new InspirationService(
      seasonality, llm, () => 6,
      { filterState, customIngredients },
      profile, settings, cookedHistory,
    );
    const recipe = new RecipeService(seasonality, llm, () => 6, settings);

    const app = createApp({
      seasonality,
      filterState,
      customIngredients,
      profile,
      settings,
      favourites,
      cookedHistory,
      hasApiKey: () => true,
      inspiration,
      recipe,
      monthProvider: () => 6,
    });

    // Step 1: User selects a model on the settings page
    const putRes = await app.request("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ activeModel: "opencode-go/chosen-model" }),
    });
    expect(putRes.status).toBe(200);
    expect(await putRes.json()).toEqual({ ok: true });

    // Verify it's persisted
    expect(settings.getActiveModel()).toBe("opencode-go/chosen-model");

    // Step 2: User clicks "Vis 6 nye"
    const postRes = await app.request("/api/inspiration", {
      method: "POST",
      headers: { accept: "text/event-stream" },
    });
    expect(postRes.status).toBe(200);

    // The LLM should have been called with the chosen model
    expect(llm.models).toHaveLength(1);
    expect(llm.models[0]).toBe("opencode-go/chosen-model");
  });

  test("PUT /api/settings with empty model returns 400", async () => {
    const db = new Database(":memory:");
    runMigrations(db);
    importSeasonalitySeed(db);

    const settings = new SettingsRepository(db);

    const app = createApp({
      seasonality: new SeasonalityRepository(db),
      filterState: new FilterStateRepository(db),
      customIngredients: new CustomIngredientsRepository(db),
      profile: new ProfileRepository(db),
      settings,
      favourites: new FavouritesRepository(db),
      cookedHistory: new CookedHistoryRepository(db),
      hasApiKey: () => true,
      inspiration: new InspirationService(
        new SeasonalityRepository(db),
        new MockLLMClient(CANNED), () => 6,
        undefined, undefined, settings, new CookedHistoryRepository(db),
      ),
      recipe: new RecipeService(
        new SeasonalityRepository(db),
        new MockLLMClient(CANNED), () => 6, settings,
      ),
      monthProvider: () => 6,
    });

    const res = await app.request("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ activeModel: "" }),
    });
    expect(res.status).toBe(400);
  });
});
