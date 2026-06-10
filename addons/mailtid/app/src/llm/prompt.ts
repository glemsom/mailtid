import type { SeasonalityIngredient } from "../db/seasonality.js";
import type { UserProfile } from "../db/profile.js";

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
 * A single in-season ingredient referenced by the user's filter
 * selection. Carries the display name so the prompt can address
 * the LLM in Danish, even though the persisted filter state is
 * keyed by slug.
 */
export interface FilteredIngredient {
  slug: string;
  nameDa: string;
}

/**
 * The three independent filter lists handed to the LLM for the
 * short-form 5-meal call. Semantics are set by ADR-0001:
 *
 * - `inSeasonIncludes` — OR. Every meal must contain at least one
 *   of these in-season ingredients.
 * - `customMandatory` — AND. Every meal must contain every one of
 *   these user-typed ingredients (typically leftovers).
 * - `excludes` — AND across the list. Every meal must contain none
 *   of these in-season ingredients.
 *
 * All three lists are independent — a section is rendered only if
 * it has at least one entry.
 */
export interface ShortFormFilter {
  inSeasonIncludes: FilteredIngredient[];
  customMandatory: string[];
  excludes: FilteredIngredient[];
}

/** The empty filter — the default before the user has touched a chip. */
export const EMPTY_SHORT_FORM_FILTER: ShortFormFilter = {
  inSeasonIncludes: [],
  customMandatory: [],
  excludes: [],
};

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
 *   4. Filtreringskrav (optional) — three independent sub-lists
 *      following ADR-0001. Omitted when the filter is empty.
 *   5. Output format — JSON object with a `meals` array, each entry
 *      having `title` and `description`. No markdown, no prose.
 */
export function buildShortFormPrompt(
  month: number,
  inSeason: readonly SeasonalityIngredient[],
  filter: ShortFormFilter = EMPTY_SHORT_FORM_FILTER,
  profile?: UserProfile,
): string {
  const monthName = danishMonthName(month);
  const ingredientList = inSeason.map((i) => i.nameDa).join(", ");

  const lines: string[] = [
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
  ];

  if (profile) {
    lines.push("", "# Kostprofil");
    lines.push(
      `- Kosttype: ${profile.dietaryPattern}.`,
      "  Du må KUN foreslå retter, der passer til denne kosttype.",
    );
    if (profile.allergies.length > 0) {
      const allergyList = profile.allergies.join(", ");
      lines.push(
        `- Allergier (må ikke indeholde): ${allergyList}.`,
        "  Ingen af disse ingredienser må optræde i forslagene.",
      );
    }
    if (profile.dislikes.length > 0) {
      lines.push(
        `- Undgå helst: ${profile.dislikes}.`,
        "  Undgå disse råvarer, når det er muligt, men de er ikke absolut forbudte.",
      );
    }
  }

  if (
    filter.inSeasonIncludes.length > 0 ||
    filter.customMandatory.length > 0 ||
    filter.excludes.length > 0
  ) {
    lines.push("", "# Filtreringskrav");
    if (filter.inSeasonIncludes.length > 0) {
      const names = filter.inSeasonIncludes.map((i) => i.nameDa).join(", ");
      lines.push(
        "- Inkluder (mindst én af): " + names + ".",
        "  Hvert forslag skal indeholde mindst én af disse råvarer.",
      );
    }
    if (filter.customMandatory.length > 0) {
      const names = filter.customMandatory.join(", ");
      lines.push(
        "- Skal indeholde: " + names + ".",
        "  Hvert forslag skal indeholde alle disse råvarer (fx rester fra køleskabet).",
      );
    }
    if (filter.excludes.length > 0) {
      const names = filter.excludes.map((i) => i.nameDa).join(", ");
      lines.push(
        "- Må ikke indeholde: " + names + ".",
        "  Ingen af disse råvarer må optræde i forslagene.",
      );
    }
  }

  lines.push(
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
  );

  return lines.join("\n");
}
