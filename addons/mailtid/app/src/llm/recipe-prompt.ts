import type { SeasonalityIngredient } from "../db/seasonality.js";
import type { RecipeMealRef } from "../inspiration/recipe-service.js";

/**
 * Build the prompt for the full-recipe LLM call. Mirrors the
 * section-labelled structure of the short-form prompt in
 * `prompt.ts` so a prompt-section test can assert on each part.
 *
 * Sections of the prompt (kept in this order, each labelled so a
 * prompt-section test can assert on its presence):
 *
 *   1. Role / task — expand one short-form Meal Inspiration into a
 *      full recipe in Danish.
 *   2. Måltid — the meal's title and description.
 *   3. Råvarer i sæson denne måned — the in-season list, so the
 *      model only suggests ingredients we know are fresh.
 *   4. Outputformat — JSON with `title`, `description`, an
 *      `ingredients` array of `{name, amount, unit}` triples, a
 *      `steps` array of strings, and `time_minutes` as an integer.
 */
export function buildRecipePrompt(
  meal: RecipeMealRef,
  inSeason: readonly SeasonalityIngredient[],
): string {
  const ingredientList = inSeason.map((i) => i.nameDa).join(", ");

  return [
    "# Opgave",
    "Du er en dansk madinspiration. Udvid det følgende korte måltidsforslag " +
      "til en fuld dansk opskrift med ingredienser, trin-for-trin " +
      "fremgangsmåde og et tidsestimat.",
    "",
    "# Sprog",
    "Svar KUN på dansk. Alle ingredienser, mængder og enheder skal være " +
      "på dansk (f.eks. 'g', 'dl', 'spsk', 'tsk', 'stk', 'l').",
    "",
    "# Måltid",
    `Titel: ${meal.title}`,
    `Beskrivelse: ${meal.description}`,
    "",
    "# Råvarer i sæson denne måned",
    `Brug primært råvarer fra denne liste: ${ingredientList}.`,
    "Du må bruge basisråvarer (salt, peber, olie, smør, mel, sukker) " +
      "uden for sæson, men alle hovedingredienser skal helst være på listen.",
    "",
    "# Outputformat",
    "Svar som JSON i præcis denne form, uden markdown, uden kodeblokke, " +
      "uden forklaringstekst:",
    "{",
    `  "title": "...",`,
    `  "description": "...",`,
    `  "ingredients": [`,
    `    { "name": "...", "amount": "...", "unit": "..." }`,
    `  ],`,
    `  "steps": [`,
    `    "..."`,
    `  ],`,
    `  "time_minutes": 30`,
    "}",
    "",
    "Tidsestimat (time_minutes) er et heltal. Antal portioner er 4.",
  ].join("\n");
}
