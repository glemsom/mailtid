import type { SeasonalityIngredient } from "../db/seasonality.js";

/**
 * The number of short-form Meal Inspirations a single home-screen
 * request returns. Settled product constant — see CONTEXT.md.
 */
export const SHORT_FORM_MEAL_COUNT = 5;

/**
 * The name of the current month in Danish (1 = "Januar", ..., 12 =
 * "December"). Used in the LLM prompt so the model knows which
 * seasonality window to apply.
 */
export const DANISH_MONTH_NAMES: readonly string[] = [
  "Januar",
  "Februar",
  "Marts",
  "April",
  "Maj",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "December",
];

export function danishMonthName(month: number): string {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Invalid month: ${month} (expected 1-12)`);
  }
  return DANISH_MONTH_NAMES[month - 1] ?? "";
}

/**
 * Build the prompt for the short-form 5-meal call. Pure function —
 * the same inputs always produce the same output, which is what
 * makes the prompt regressions testable.
 *
 * Sections of the prompt (kept in this order, each labelled so a
 * prompt-section test can assert on its presence):
 *
 *   1. Role / task — produce 5 short-form Meal Inspirations in Danish.
 *   2. Month — current Danish month name and 1-12 number.
 *   3. In-season ingredients — the comma-separated list of ingredients
 *      in season this month. The LLM is told to use only these.
 *   4. Output format — JSON object with a `meals` array, each entry
 *      having `title` and `description`. No markdown, no prose.
 */
export function buildShortFormPrompt(
  month: number,
  inSeason: readonly SeasonalityIngredient[],
): string {
  const monthName = danishMonthName(month);
  const ingredientList = inSeason.map((i) => i.nameDa).join(", ");

  return [
    "# Opgave",
    `Du er en dansk madinspiration. Foreslå præcis ${SHORT_FORM_MEAL_COUNT} ` +
      `korte middagsforslag (måltidsinspiration) til en dansk husstand.`,
    "",
    "# Sprog",
    "Svar KUN på dansk. Hvert forslag skal have en dansk titel og en kort " +
      "dansk beskrivelse (1-2 sætninger), nok til at brugeren kan afgøre " +
      "om de vil vide mere.",
    "",
    "# Måned",
    `Lige nu er det ${monthName} (måned ${month}).`,
    "",
    "# Råvarer i sæson denne måned",
    `Brug KUN råvarer fra denne liste: ${ingredientList}.`,
    "Listen er hårdkodet — du må ikke vælge råvarer, der ikke er på listen.",
    "",
    "# Outputformat",
    "Svar som JSON i præcis denne form, uden markdown, uden kodeblokke, " +
      "uden forklaringstekst:",
    "{",
    `  "meals": [`,
    `    { "title": "...", "description": "..." }`,
    `    ... i alt ${SHORT_FORM_MEAL_COUNT} forslag ...`,
    "  ]",
    "}",
  ].join("\n");
}
