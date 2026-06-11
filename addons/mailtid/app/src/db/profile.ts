import type Database from "better-sqlite3";

/**
 * The fixed list of allergy values the user can pick from. Danish
 * labels matching the EU-regulated allergen list, restricted to the
 * ones that are meaningful in a meal-planning context.
 */
export const ALLERGY_OPTIONS: readonly string[] = [
  "Mælk",
  "Æg",
  "Fisk",
  "Skaldyr",
  "Nødder",
  "Jordnødder",
  "Soja",
  "Gluten",
  "Selleri",
  "Sennep",
  "Sesam",
  "Lupin",
];

export const DIETARY_PATTERNS: readonly string[] = [
  "omnivore",
  "pescatarian",
  "vegetarian",
  "vegan",
  "lowcarb",
];

export type DietaryPattern = (typeof DIETARY_PATTERNS)[number];

/**
 * The persistent user profile. A single row in SQLite, updated
 * from the settings page. The LLM prompt always reflects the
 * current values — see {@link buildShortFormPrompt}.
 */
export interface UserProfile {
  dietaryPattern: DietaryPattern;
  allergies: string[];
  dislikes: string;
}

function parseAllergies(raw: string): string[] {
  if (raw.length === 0) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (v): v is string => typeof v === "string" && ALLERGY_OPTIONS.includes(v),
  );
}

/**
 * Single-row repository for the user profile. Backed by the
 * `user_profile` table; the table is constrained to a single
 * row (id = 1), and `save()` is an upsert against that row.
 */
export class ProfileRepository {
  constructor(private readonly db: Database.Database) {}

  /**
   * Read the current profile. Returns `null` if no row has been
   * written — this is the signal for the first-run banner.
   */
  find(): UserProfile | null {
    const row = this.db
      .prepare<
        [],
        { dietary_pattern: string; allergies_json: string; dislikes: string }
      >(
        `SELECT dietary_pattern, allergies_json, dislikes
         FROM user_profile WHERE id = 1`,
      )
      .get();
    if (!row) return null;
    return {
      dietaryPattern: validateDietaryPattern(row.dietary_pattern),
      allergies: parseAllergies(row.allergies_json),
      dislikes: row.dislikes,
    };
  }

  /**
   * Upsert the user profile. Validates dietary pattern and
   * allergies against their respective valid-value sets. Returns
   * the saved profile.
   */
  save(input: { dietaryPattern: string; allergies: string[]; dislikes: string }): UserProfile {
    const dietaryPattern = validateDietaryPattern(input.dietaryPattern);
    const allergies = validateAllergies(input.allergies);
    const dislikes = input.dislikes.trim();

    this.db
      .prepare(
        `INSERT INTO user_profile (id, dietary_pattern, allergies_json, dislikes)
         VALUES (1, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           dietary_pattern = excluded.dietary_pattern,
           allergies_json = excluded.allergies_json,
           dislikes = excluded.dislikes`,
      )
      .run(dietaryPattern, JSON.stringify(allergies), dislikes);

    return { dietaryPattern, allergies, dislikes };
  }
}

function validateDietaryPattern(value: string): DietaryPattern {
  if (!DIETARY_PATTERNS.includes(value)) {
    throw new Error(
      `Ugyldig kosttype: "${value}". Gyldige: ${DIETARY_PATTERNS.join(", ")}`,
    );
  }
  return value as DietaryPattern;
}

function validateAllergies(values: string[]): string[] {
  for (const v of values) {
    if (!ALLERGY_OPTIONS.includes(v)) {
      throw new Error(
        `Ugyldig allergi: "${v}". Gyldige: ${ALLERGY_OPTIONS.join(", ")}`,
      );
    }
  }
  return [...values];
}
