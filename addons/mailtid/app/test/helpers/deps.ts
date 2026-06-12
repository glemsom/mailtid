import Database from "better-sqlite3";
import { runMigrations } from "../../src/db/migrate.js";
import { importSeasonalitySeed } from "../../src/db/seed.js";
import { SeasonalityRepository } from "../../src/db/seasonality.js";
import { FilterStateRepository } from "../../src/db/filter-state.js";
import { CustomIngredientsRepository } from "../../src/db/custom-ingredients.js";
import { PantryRepository } from "../../src/db/pantry.js";
import { ProfileRepository } from "../../src/db/profile.js";
import { SettingsRepository } from "../../src/db/settings.js";
import { FavouritesRepository } from "../../src/db/favourites.js";
import { CookedHistoryRepository } from "../../src/db/cooked-history.js";
import { CachedMealsRepository } from "../../src/db/cached-meals.js";
import { MockLLMClient } from "../../src/llm/mock.js";
import { LLMOrchestrator } from "../../src/llm/orchestrator.js";
import { InspirationService } from "../../src/inspiration/service.js";
import { RecipeService } from "../../src/inspiration/recipe-service.js";
import type { AppDeps } from "../../src/server/app.js";

export interface TestDeps {
  deps: AppDeps;
  llm: MockLLMClient;
  db: Database.Database;
  month: number;
}

async function stubRefreshModelCache(): Promise<string> {
  return "OK (test stub)";
}

/**
 * Build a complete set of app dependencies for tests. Uses an
 * in-memory SQLite (per the PRD's "No live DB on disk" rule), a
 * {@link MockLLMClient} returning the supplied canned response, and
 * a fixed month provider so the prompt is deterministic.
 *
 * The single `MockLLMClient` is shared between the short-form
 * inspiration service and the full-recipe service. For tests that
 * care about which call the LLM sees, the prompt list on the mock
 * records them in order.
 */
export function makeTestDeps(opts: {
  cannedResponse: string;
  month: number;
  /** When false, the app behaves as if no OpenCode API key is set. Defaults to true. */
  hasApiKey?: boolean;
}): TestDeps {
  const db = new Database(":memory:");
  runMigrations(db);
  importSeasonalitySeed(db);
  const seasonality = new SeasonalityRepository(db);
  const filterState = new FilterStateRepository(db);
  const customIngredients = new CustomIngredientsRepository(db);
  const pantry = new PantryRepository(db);
  const profile = new ProfileRepository(db);
  const settings = new SettingsRepository(db);
  const favourites = new FavouritesRepository(db);
  const cookedHistory = new CookedHistoryRepository(db);
  const cachedMeals = new CachedMealsRepository(db);
  const llm = new MockLLMClient(opts.cannedResponse);
  const orchestrator = new LLMOrchestrator(llm, settings);
  const inspiration = new InspirationService(
    seasonality,
    orchestrator,
    () => opts.month,
    { filterState, customIngredients, pantry },
    profile,
    cookedHistory,
  );
  const recipe = new RecipeService(seasonality, llm, () => opts.month, settings);
  return {
    deps: {
      seasonality,
      filterState,
      customIngredients,
      pantry,
      profile,
      settings,
      favourites,
      cookedHistory,
      cachedMeals,
      inspiration,
      recipe,
      monthProvider: () => opts.month,
      hasApiKey: () => opts.hasApiKey !== false,
    refreshModelCache: stubRefreshModelCache,
    },
    llm,
    db,
    month: opts.month,
  };
}
