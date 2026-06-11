import type { SeasonalityIngredient } from "../db/seasonality.js";
import type { LLMClient } from "../llm/client.js";
import {
  buildShortFormPrompt,
  type FilteredIngredient,
  type ShortFormFilter,
} from "../llm/prompt.js";
import { extractJsonObject } from "../llm/response.js";
import type { SeasonalityRepository } from "../db/seasonality.js";
import type { FilterStateRepository } from "../db/filter-state.js";
import type { CustomIngredientsRepository } from "../db/custom-ingredients.js";
import type { ProfileRepository } from "../db/profile.js";
import type { SettingsRepository } from "../db/settings.js";
import type { CookedHistoryRepository } from "../db/cooked-history.js";

/** Danish labels for dietary patterns shown in status messages. */
const DIETARY_LABELS: Record<string, string> = {
  omnivore: "altspisende",
  pescatarian: "pescetar",
  vegetarian: "vegetar",
  vegan: "vegan",
};

/**
 * A single short-form Meal Inspiration. Returned by the home-screen
 * 5-meal call and shown as a card. A full recipe (ingredients,
 * steps, time) is fetched separately on card tap.
 */
export interface MealInspiration {
  title: string;
  description: string;
}

/**
 * The shape the LLM is asked to produce for the short-form 5-meal
 * call. The service parses the LLM's raw text into a
 * `MealInspiration[]`.
 */
interface ShortFormResponse {
  meals: MealInspiration[];
}

/**
 * Parse the LLM's raw text into a `ShortFormResponse`. The LLM is
 * told in the prompt to return pure JSON, but real models sometimes
 * wrap the answer in ```json``` fences or add a one-line preamble.
 * This parser strips both forms before parsing.
 *
 * Throws if the response is not a JSON object with a `meals` array
 * of the expected shape — the caller (an HTTP handler) maps that
 * to a 502 / generic Danish error.
 */
export function parseShortFormResponse(raw: string): MealInspiration[] {
  return validateShortFormResponse(extractJsonObject(raw));
}

function validateShortFormResponse(value: unknown): MealInspiration[] {
  if (!value || typeof value !== "object") {
    throw new Error("LLM response was not a JSON object");
  }
  const meals = (value as { meals?: unknown }).meals;
  if (!Array.isArray(meals)) {
    throw new Error("LLM response missing 'meals' array");
  }
  return meals.map((m, i) => validateMeal(m, i));
}

function validateMeal(value: unknown, index: number): MealInspiration {
  if (!value || typeof value !== "object") {
    throw new Error(`meals[${index}] was not an object`);
  }
  const obj = value as { title?: unknown; description?: unknown };
  if (typeof obj.title !== "string" || obj.title.length === 0) {
    throw new Error(`meals[${index}].title must be a non-empty string`);
  }
  if (typeof obj.description !== "string" || obj.description.length === 0) {
    throw new Error(`meals[${index}].description must be a non-empty string`);
  }
  return { title: obj.title, description: obj.description };
}

/**
 * Optional filter dependencies for {@link InspirationService}. When
 * provided, the service reads the user's current in-season filter
 * state and custom mandatory ingredients from SQLite and folds them
 * into the LLM prompt per ADR-0001. When omitted, the prompt is
 * built without any filter section (the behaviour in slice #5).
 */
export interface InspirationServiceFilterDeps {
  filterState: FilterStateRepository;
  customIngredients: CustomIngredientsRepository;
}

/**
 * Business logic for the home-screen 5-meal call. Owns the
 * "look up in-season, build prompt, call LLM, parse response"
 * flow; the HTTP layer is a thin wrapper.
 *
 * The class is intentionally tiny: a single public method,
 * `shortForm()`. The seams (SeasonalityRepository, LLMClient,
 * monthProvider, optional filter deps) are injected, so the service
 * is trivially testable against `:memory:` SQLite and a
 * `MockLLMClient`.
 */
export class InspirationService {
  constructor(
    private readonly seasonality: SeasonalityRepository,
    private readonly llm: LLMClient,
    /** Provides the "current" month (1-12) for the request. */
    private readonly monthProvider: () => number,
    private readonly filterDeps?: InspirationServiceFilterDeps,
    private readonly profileRepo?: ProfileRepository,
    private readonly settingsRepo?: SettingsRepository,
    private readonly cookedHistoryRepo?: CookedHistoryRepository,
  ) {}

  /**
   * Produce 5 short-form Meal Inspirations for the current month,
   * constrained to the in-season Danish ingredient list and the
   * user's current filter selection.
   *
   * @param opts.onStatus Called with build-phase status messages
   *   (fetching, building stats, AI calling).
   * @param opts.onReasoning Called with raw reasoning token deltas
   *   as they arrive from the LLM (for reasoning-capable models).
   */
  async shortForm(opts?: {
    onStatus?: (status: string) => void;
    onReasoning?: (token: string) => void;
  }): Promise<MealInspiration[]> {
    const month = this.monthProvider();

    // Phase 1: fetch data from SQLite.
    opts?.onStatus?.("Henter ingredienser og profil...");
    const inSeason: SeasonalityIngredient[] =
      this.seasonality.findInSeasonForMonth(month);
    const filter = this.filterDeps
      ? this.buildFilter(inSeason)
      : undefined;
    const profile = this.profileRepo?.find() ?? undefined;
    const cookedTitles = this.cookedHistoryRepo
      ? this.cookedHistoryRepo
          .listSince(Date.now() - 14 * 24 * 60 * 60 * 1000)
          .map((m) => m.title)
      : undefined;

    // Phase 2: prompt built — emit statistics.
    const prompt = buildShortFormPrompt(month, inSeason, filter, profile, cookedTitles);
    opts?.onStatus?.(buildStatusMessage(inSeason, filter, profile));

    // Phase 3: call the LLM via streaming.
    opts?.onStatus?.("AI tænker...");
    const activeModel = this.settingsRepo?.getActiveModel() ?? undefined;
    const raw = await this.llm.stream(prompt, {
      model: activeModel ?? undefined,
      onReasoning: opts?.onReasoning,
    });
    return parseShortFormResponse(raw);
  }

  /**
   * Resolve the user's saved filter state and custom mandatory
   * ingredients into the shape the prompt module consumes.
   *
   * Slugs that don't match an in-season ingredient for the current
   * month are silently dropped — protects against stale filter
   * state (e.g. an in-season include from a previous month).
   */
  private buildFilter(
    inSeason: readonly SeasonalityIngredient[],
  ): ShortFormFilter {
    if (!this.filterDeps) {
      return { inSeasonIncludes: [], customMandatory: [], excludes: [] };
    }
    const inSeasonSlugs = new Set(inSeason.map((i) => i.slug));
    const bySlug = new Map(inSeason.map((i) => [i.slug, i]));
    const filterState = this.filterDeps.filterState.find();
    const toFiltered = (slugs: string[]): FilteredIngredient[] =>
      slugs
        .filter((s) => inSeasonSlugs.has(s))
        .map((s) => {
          const ing = bySlug.get(s);
          return { slug: s, nameDa: ing?.nameDa ?? s };
        });
    const customMandatory = this.filterDeps.customIngredients
      .list()
      .map((i) => i.nameDa);
    return {
      inSeasonIncludes: toFiltered(filterState.includes),
      customMandatory,
      excludes: toFiltered(filterState.excludes),
    };
  }
}

/**
 * Build the "Bygger forespørgsel: ..." status message with
 * concrete statistics the user can see. Pure function so tests
 * can call it directly.
 */
export function buildStatusMessage(
  inSeason: readonly SeasonalityIngredient[],
  filter: ShortFormFilter | undefined,
  profile: { dietaryPattern: string } | undefined,
): string {
  const ingredientCount = inSeason.length;
  const filterCount = filter
    ? filter.inSeasonIncludes.length + filter.customMandatory.length + filter.excludes.length
    : 0;

  let msg = `Bygger forespørgsel: ${ingredientCount} råvarer, ${filterCount} filtre`;
  if (profile) {
    const label = DIETARY_LABELS[profile.dietaryPattern] ?? profile.dietaryPattern;
    msg += `, kostprofil: ${label}`;
  }
  return msg;
}
