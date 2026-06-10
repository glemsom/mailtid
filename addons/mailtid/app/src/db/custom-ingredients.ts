import type Database from "better-sqlite3";

/**
 * A single user-typed "must include" ingredient. The slug is the
 * stable identifier (so renames are deduped), the display name is
 * what the user actually typed. Custom mandatory ingredients are
 * always positive — the filter semantics is "every suggestion must
 * contain this ingredient" (see ADR-0001).
 */
export interface CustomIngredient {
  slug: string;
  nameDa: string;
}

/**
 * Slugify a user-typed custom mandatory ingredient name. Lower-cases,
 * collapses whitespace into dashes, and trims. Danish letters (æ, ø,
 * å) are preserved — they're meaningful to the user and the LLM,
 * and the slug is internal anyway.
 */
export function slugifyCustomIngredient(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

/**
 * Repository for the user's custom mandatory ingredients. Backed by
 * the `custom_ingredients` table; the slug is the primary key, so
 * a second `add()` of the same input is a no-op.
 */
export class CustomIngredientsRepository {
  constructor(private readonly db: Database.Database) {}

  /**
   * All custom mandatory ingredients the user has added, oldest first.
   * Order is by `created_at` then `slug` for stable rendering.
   */
  list(): CustomIngredient[] {
    const rows = this.db
      .prepare<[], { slug: string; name_da: string }>(
        `SELECT slug, name_da
         FROM custom_ingredients
         ORDER BY rowid ASC`,
      )
      .all();
    return rows.map((r) => ({ slug: r.slug, nameDa: r.name_da }));
  }

  /**
   * Add a custom mandatory ingredient. Throws if the input is empty
   * or whitespace-only. A second `add()` of the same name is a
   * no-op (the slug is the primary key). Insertion order is tracked
   * via the table's `rowid` — three adds in the same millisecond
   * still come back in the order they were inserted.
   *
   * Returns the stored `{ slug, nameDa }` entry. The display name
   * is the trimmed input the caller passed, not whatever happened
   * to already be in the table — that way a second `add()` of the
   * same slug with a different casing returns the new casing.
   */
  add(name: string): CustomIngredient {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      throw new Error("custom ingredient name must not be empty");
    }
    const slug = slugifyCustomIngredient(name);
    this.db
      .prepare(
        `INSERT OR IGNORE INTO custom_ingredients (slug, name_da)
         VALUES (?, ?)`,
      )
      .run(slug, trimmed);
    return { slug, nameDa: trimmed };
  }

  /**
   * Remove a custom mandatory ingredient by slug. No-op if the slug
   * is not present.
   */
  remove(slug: string): void {
    this.db
      .prepare(`DELETE FROM custom_ingredients WHERE slug = ?`)
      .run(slug);
  }
}
