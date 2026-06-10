import type { SeasonalityIngredient } from "../db/seasonality.js";
import type { LLMClient } from "../llm/client.js";
import { buildShortFormPrompt } from "../llm/prompt.js";
import type { SeasonalityRepository } from "../db/seasonality.js";

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
  // Strip ```json ... ``` fences if the model added them.
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced?.[1] ?? raw;
  // Find the first { ... } block in case the model added prose.
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    throw new Error("LLM response contained no JSON object");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
  } catch (err) {
    throw new Error(`LLM response was not valid JSON: ${(err as Error).message}`);
  }
  return validateShortFormResponse(parsed);
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
 * Business logic for the home-screen 5-meal call. Owns the
 * "look up in-season, build prompt, call LLM, parse response"
 * flow; the HTTP layer is a thin wrapper.
 *
 * The class is intentionally tiny: a single public method,
 * `shortForm()`. The seams (SeasonalityRepository, LLMClient,
 * monthProvider) are injected, so the service is trivially
 * testable against `:memory:` SQLite and a `MockLLMClient`.
 */
export class InspirationService {
  constructor(
    private readonly seasonality: SeasonalityRepository,
    private readonly llm: LLMClient,
    /** Provides the "current" month (1-12) for the request. */
    private readonly monthProvider: () => number,
  ) {}

  /**
   * Produce 5 short-form Meal Inspirations for the current month,
   * constrained to the in-season Danish ingredient list.
   */
  async shortForm(): Promise<MealInspiration[]> {
    const month = this.monthProvider();
    const inSeason: SeasonalityIngredient[] =
      this.seasonality.findInSeasonForMonth(month);
    const prompt = buildShortFormPrompt(month, inSeason);
    const raw = await this.llm.chat(prompt);
    return parseShortFormResponse(raw);
  }
}
