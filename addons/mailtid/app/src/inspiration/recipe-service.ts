import type { SeasonalityIngredient, SeasonalityRepository } from "../db/seasonality.js";
import type { SettingsRepository } from "../db/settings.js";
import type { LLMClient } from "../llm/client.js";
import { buildRecipePrompt } from "../llm/recipe-prompt.js";
import { extractJsonObject } from "../llm/response.js";

/**
 * Minimal shape the recipe service needs from a meal — just the
 * title and description so the LLM knows which meal to expand.
 */
export interface RecipeMealRef {
  title: string;
  description: string;
}

/**
 * A single ingredient line in a {@link FullRecipe}. `amount` and
 * `unit` are kept as strings so the model can return free-form
 * values like "1 knsp" or "efter smag" without us coercing them.
 */
export interface FullRecipeIngredient {
  name: string;
  amount: string;
  unit: string;
}

/**
 * A full Danish recipe fetched in a second, targeted LLM call when
 * the user taps a Meal Inspiration card. Mirrors the shape called
 * for in the issue (#8) and is the value returned by
 * `RecipeService.fullRecipe()`.
 */
export interface FullRecipe {
  title: string;
  description: string;
  ingredients: FullRecipeIngredient[];
  steps: string[];
  timeMinutes: number;
}

/**
 * Parse the LLM's raw text into a {@link FullRecipe}. The LLM is
 * told in the prompt to return pure JSON, but real models sometimes
 * wrap the answer in ```json``` fences or add a one-line preamble.
 * This parser strips both forms before parsing.
 *
 * Throws if the response is not a JSON object with the expected
 * shape — the caller (an HTTP handler) maps that to a 502 / generic
 * Danish error.
 */
export function parseRecipeResponse(raw: string): FullRecipe {
  return validateFullRecipe(extractJsonObject(raw));
}

function validateFullRecipe(value: unknown): FullRecipe {
  if (!value || typeof value !== "object") {
    throw new Error("LLM response was not a JSON object");
  }
  const obj = value as {
    title?: unknown;
    description?: unknown;
    ingredients?: unknown;
    steps?: unknown;
    time_minutes?: unknown;
  };
  if (typeof obj.title !== "string" || obj.title.length === 0) {
    throw new Error("title must be a non-empty string");
  }
  if (typeof obj.description !== "string" || obj.description.length === 0) {
    throw new Error("description must be a non-empty string");
  }
  if (!Array.isArray(obj.ingredients)) {
    throw new Error("ingredients must be an array");
  }
  const ingredients = obj.ingredients.map((ing, i) =>
    validateIngredient(ing, i),
  );
  if (!Array.isArray(obj.steps) || obj.steps.length === 0) {
    throw new Error("steps must be a non-empty array");
  }
  const steps = obj.steps.map((s, i) => validateStep(s, i));
  if (
    typeof obj.time_minutes !== "number" ||
    !Number.isInteger(obj.time_minutes) ||
    obj.time_minutes <= 0
  ) {
    throw new Error("time_minutes must be a positive integer");
  }
  return {
    title: obj.title,
    description: obj.description,
    ingredients,
    steps,
    timeMinutes: obj.time_minutes,
  };
}

function validateIngredient(value: unknown, index: number): FullRecipeIngredient {
  if (!value || typeof value !== "object") {
    throw new Error(`ingredients[${index}] was not an object`);
  }
  const obj = value as { name?: unknown; amount?: unknown; unit?: unknown };
  if (typeof obj.name !== "string" || obj.name.length === 0) {
    throw new Error(`ingredients[${index}].name must be a non-empty string`);
  }
  if (typeof obj.amount !== "string" || obj.amount.length === 0) {
    throw new Error(`ingredients[${index}].amount must be a non-empty string`);
  }
  if (typeof obj.unit !== "string" || obj.unit.length === 0) {
    throw new Error(`ingredients[${index}].unit must be a non-empty string`);
  }
  return { name: obj.name, amount: obj.amount, unit: obj.unit };
}

function validateStep(value: unknown, index: number): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`steps[${index}] must be a non-empty string`);
  }
  return value;
}

/**
 * Business logic for the full-recipe call. Owns the
 * "look up in-season, build prompt, call LLM, parse response"
 * flow for a single Meal Inspiration; the HTTP layer is a thin
 * wrapper. Mirrors {@link InspirationService} in shape, but
 * scoped to one meal and to the full-recipe shape.
 */
export class RecipeService {
  constructor(
    private readonly seasonality: SeasonalityRepository,
    private readonly llm: LLMClient,
    /** Provides the "current" month (1-12) for the request. */
    private readonly monthProvider: () => number,
    /**
     * Source of the user's active model. When provided, the
     * selected model is threaded through to the LLM call so the
     * recipe call uses the same model the home-screen call does.
     * When omitted (tests, or callers that don't care), the
     * LLMClient falls back to its own default.
     */
    private readonly settingsRepo?: SettingsRepository,
  ) {}

  /**
   * Produce a {@link FullRecipe} for the given short-form Meal
   * Inspiration, constrained to the in-season Danish ingredient
   * list for the current month.
   *
   * @param opts.onStatus Called with build-phase status messages.
   * @param opts.onReasoning Called with raw reasoning token deltas
   *   as they arrive from the LLM (for reasoning-capable models).
   */
  async fullRecipe(
    meal: RecipeMealRef,
    opts?: {
      onStatus?: (status: string) => void;
      onReasoning?: (token: string) => void;
    },
  ): Promise<FullRecipe> {
    const month = this.monthProvider();
    opts?.onStatus?.("Henter ingredienser...");
    const inSeason: SeasonalityIngredient[] =
      this.seasonality.findInSeasonForMonth(month);
    const prompt = buildRecipePrompt(meal, inSeason);
    const activeModel = this.resolveActiveModel();
    opts?.onStatus?.("AI tænker over opskriften...");
    const raw = await this.llm.stream(
      prompt,
      activeModel
        ? { model: activeModel, onReasoning: opts?.onReasoning }
        : { onReasoning: opts?.onReasoning },
    );
    return parseRecipeResponse(raw);
  }

  /**
   * Resolve the active model for an LLM call. Ordered fallback:
   * 1. The user's explicitly saved model (from settings page).
   * 2. The first free model in the cached model list.
   * 3. Any cached model (if no free models exist).
   * 4. `undefined` — lets the LLMClient pick its own hardcoded default.
   */
  private resolveActiveModel(): string | undefined {
    const active = this.settingsRepo?.getActiveModel();
    if (active) return active;

    const allModels = this.settingsRepo?.listModels();
    if (!allModels || allModels.length === 0) return undefined;
    const freeModel = allModels.find((m) => m.tier === "free");
    return freeModel?.modelId ?? allModels[0]?.modelId;
  }
}
