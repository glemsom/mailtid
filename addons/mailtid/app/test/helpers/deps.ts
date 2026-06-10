import Database from "better-sqlite3";
import { runMigrations } from "../../src/db/migrate.js";
import { importSeasonalitySeed } from "../../src/db/seed.js";
import { SeasonalityRepository } from "../../src/db/seasonality.js";
import { FilterStateRepository } from "../../src/db/filter-state.js";
import { CustomIngredientsRepository } from "../../src/db/custom-ingredients.js";
import { MockLLMClient } from "../../src/llm/mock.js";
import { InspirationService } from "../../src/inspiration/service.js";
import { RecipeService } from "../../src/inspiration/recipe-service.js";
import type { AppDeps } from "../../src/server/app.js";

export interface TestDeps {
  deps: AppDeps;
  llm: MockLLMClient;
  db: Database.Database;
  month: number;
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
}): TestDeps {
  const db = new Database(":memory:");
  runMigrations(db);
  importSeasonalitySeed(db);
  const seasonality = new SeasonalityRepository(db);
  const filterState = new FilterStateRepository(db);
  const customIngredients = new CustomIngredientsRepository(db);
  const llm = new MockLLMClient(opts.cannedResponse);
  const inspiration = new InspirationService(
    seasonality,
    llm,
    () => opts.month,
    { filterState, customIngredients },
  );
  const recipe = new RecipeService(seasonality, llm, () => opts.month);
  return {
    deps: {
      seasonality,
      filterState,
      customIngredients,
      inspiration,
      recipe,
      monthProvider: () => opts.month,
    },
    llm,
    db,
    month: opts.month,
  };
}
