import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3";

/**
 * The shape of `addons/mailtid/app/data/seasonality.json` — a curated
 * Danish in-season dataset. The slugs are the stable identifier; the
 * `months` array lists the months (1-12) during which the ingredient
 * is in season in Denmark.
 */
export interface SeedIngredient {
  slug: string;
  name_da: string;
  months: number[];
}

interface SeedFile {
  ingredients: SeedIngredient[];
}

/**
 * Resolve the path to the bundled `seasonality.json` seed. The seed
 * ships with the add-on (copied into `/app/data/seasonality.json` by
 * the Dockerfile) and is read-only at runtime.
 */
function seedPath(): string {
  // Resolve relative to this module's location so the path is stable
  // regardless of process.cwd() (matters in tests and in the container).
  const here = dirname(fileURLToPath(import.meta.url));
  // `src/db/seed.ts` is two levels above `data/seasonality.json`.
  return resolve(here, "..", "..", "data", "seasonality.json");
}

export function readSeasonalitySeed(): SeedFile {
  const raw = readFileSync(seedPath(), "utf8");
  return JSON.parse(raw) as SeedFile;
}

/**
 * Import the seed into the `seasonality` table. Idempotent — uses
 * `INSERT OR IGNORE` against the composite primary key, so a second
 * call after the data is already there is a no-op.
 */
export function importSeasonalitySeed(db: Database.Database): void {
  const { ingredients } = readSeasonalitySeed();

  const insert = db.prepare(
    "INSERT OR IGNORE INTO seasonality (slug, name_da, month) VALUES (?, ?, ?)",
  );

  const tx = db.transaction((items: SeedIngredient[]) => {
    for (const ing of items) {
      for (const month of ing.months) {
        insert.run(ing.slug, ing.name_da, month);
      }
    }
  });

  tx(ingredients);
}
