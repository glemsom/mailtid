import type Database from "better-sqlite3";

/**
 * A single basisvare (pantry staple) — a persistent ingredient the
 * user always has on hand. The slug is the stable identifier (so
 * renames are deduped), the display name is what the user actually
 * typed. Pantry items are AND'ed into the prompt alongside custom
 * mandatory ingredients (same semantics: every meal must contain
 * every pantry staple).
 */
export interface PantryItem {
  slug: string;
  nameDa: string;
}

/**
 * Slugify a user-typed pantry item name. Lower-cases, collapses
 * whitespace into dashes, and trims. Danish letters (æ, ø, å) are
 * preserved — they're meaningful to the user and the LLM, and the
 * slug is internal anyway.
 */
export function slugifyPantryItem(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

/**
 * Repository for the user's pantry staples (basisvarer). Backed by
 * the `pantry_items` table; the slug is the primary key, so a
 * second `add()` of the same input is a no-op.
 */
export class PantryRepository {
  constructor(private readonly db: Database.Database) {}

  /**
   * All pantry items the user has added, oldest first. Order is by
   * `rowid` so insertions are stable.
   */
  list(): PantryItem[] {
    const rows = this.db
      .prepare<[], { slug: string; name_da: string }>(
        `SELECT slug, name_da
         FROM pantry_items
         ORDER BY rowid ASC`,
      )
      .all();
    return rows.map((r) => ({ slug: r.slug, nameDa: r.name_da }));
  }

  /**
   * Add a pantry item. Throws if the input is empty or whitespace-
   * only. A second `add()` of the same name is a no-op (the slug
   * is the primary key). Insertion order is tracked via the
   * table's `rowid`.
   *
   * Returns the stored `{ slug, nameDa }` entry. The display name
   * is the trimmed input the caller passed, not whatever happened
   * to already be in the table — that way a second `add()` of the
   * same slug with a different casing returns the new casing.
   */
  add(name: string): PantryItem {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      throw new Error("pantry item name must not be empty");
    }
    const slug = slugifyPantryItem(name);
    this.db
      .prepare(
        `INSERT OR IGNORE INTO pantry_items (slug, name_da)
         VALUES (?, ?)`,
      )
      .run(slug, trimmed);
    return { slug, nameDa: trimmed };
  }

  /**
   * Remove a pantry item by slug. No-op if the slug is not present.
   */
  remove(slug: string): void {
    this.db
      .prepare(`DELETE FROM pantry_items WHERE slug = ?`)
      .run(slug);
  }
}
