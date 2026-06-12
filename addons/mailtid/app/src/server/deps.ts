import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { runMigrations } from "../db/migrate.js";
import { importSeasonalitySeed } from "../db/seed.js";
import { SeasonalityRepository } from "../db/seasonality.js";
import { FilterStateRepository } from "../db/filter-state.js";
import { CustomIngredientsRepository } from "../db/custom-ingredients.js";
import { PantryRepository } from "../db/pantry.js";
import { ProfileRepository } from "../db/profile.js";
import { SettingsRepository } from "../db/settings.js";
import { FavouritesRepository } from "../db/favourites.js";
import { CookedHistoryRepository } from "../db/cooked-history.js";
import { CachedMealsRepository } from "../db/cached-meals.js";
import { InspirationService } from "../inspiration/service.js";
import { RecipeService } from "../inspiration/recipe-service.js";
import { RealLLMClient } from "../llm/real.js";
import { refreshModelCache } from "../llm/models.js";
import type { LLMClient } from "../llm/client.js";
import type { AppDeps } from "./app.js";
import type { MailtidConfig } from "./config.js";

/**
 * Where the SQLite file lives. The HA Supervisor maps `/data` to a
 * host path that survives container restarts and add-on updates.
 * In local development, the same file is used so the on-disk seed
 * import path is exercisable.
 */
export const DEFAULT_DB_PATH = "/data/mailtid.db";

export interface BuildDepsOptions {
  /** Path to the SQLite file. Defaults to `/data/mailtid.db`. */
  dbPath?: string;
  /**
   * Provider of the "current" month (1-12) for each inspiration
   * request. Defaults to `new Date().getMonth() + 1` (system clock).
   */
  monthProvider?: () => number;
  /**
   * Override the LLM client. Production wires in a RealLLMClient;
   * tests wire in a MockLLMClient.
   */
  llm?: LLMClient;
}

/**
 * Open the SQLite database, run migrations, import the seed, and
 * build the full set of app dependencies.
 *
 * The function is intentionally synchronous (better-sqlite3 is
 * synchronous). The DB is opened in WAL mode for concurrent reads.
 */
export function buildAppDeps(
  config: MailtidConfig,
  options: BuildDepsOptions = {},
): AppDeps {
  const dbPath =
    options.dbPath ??
    process.env.MAILTID_DB_PATH ??
    DEFAULT_DB_PATH;
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
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
  const llm =
    options.llm ??
    new RealLLMClient(() => config.opencodeApiKey || settings.getApiKey());
  const monthProvider =
    options.monthProvider ?? (() => new Date().getMonth() + 1);
  const inspiration = new InspirationService(seasonality, llm, monthProvider, {
    filterState,
    customIngredients,
    pantry,
  }, profile, settings, cookedHistory);
  const recipe = new RecipeService(seasonality, llm, monthProvider, settings);

  return {
    seasonality,
    filterState,
    customIngredients,
    pantry,
    profile,
    settings,
    favourites,
    cookedHistory,
    cachedMeals,
    hasApiKey: () =>
      config.opencodeApiKey.length > 0 || settings.getApiKey().length > 0,
    inspiration,
    recipe,
    monthProvider,
    refreshModelCache: () =>
      refreshModelCache(
        config.opencodeApiKey || settings.getApiKey(),
        settings,
      ),
  };
}
