import { describe, expect, test } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../../src/db/migrate.js";
import { importSeasonalitySeed } from "../../src/db/seed.js";
import { SeasonalityRepository } from "../../src/db/seasonality.js";
import { FilterStateRepository } from "../../src/db/filter-state.js";
import { CustomIngredientsRepository } from "../../src/db/custom-ingredients.js";
import { MockLLMClient } from "../../src/llm/mock.js";
import { InspirationService } from "../../src/inspiration/service.js";

const CANNED = JSON.stringify({ meals: [] });

function makeService(opts: {
  month: number;
}): { service: InspirationService; llm: MockLLMClient; db: Database.Database } {
  const db = new Database(":memory:");
  runMigrations(db);
  importSeasonalitySeed(db);
  const seasonality = new SeasonalityRepository(db);
  const filterState = new FilterStateRepository(db);
  const customIngredients = new CustomIngredientsRepository(db);
  const llm = new MockLLMClient(CANNED);
  const service = new InspirationService(
    seasonality,
    llm,
    () => opts.month,
    { filterState, customIngredients },
  );
  return { service, llm, db };
}

describe("InspirationService with filter", () => {
  test("with an empty filter the prompt does not mention Filtreringskrav", async () => {
    const { service, llm } = makeService({ month: 6 });

    await service.shortForm();

    expect(llm.prompts[0]?.toLowerCase()).not.toContain("filtrering");
  });

  test("in-season includes are passed to the LLM in the filter section", async () => {
    const { service, llm, db } = makeService({ month: 6 });
    new FilterStateRepository(db).save({
      includes: ["asparges", "jordbaer"],
      excludes: [],
    });

    await service.shortForm();

    const prompt = llm.prompts[0] ?? "";
    expect(prompt).toContain("Filtreringskrav");
    expect(prompt).toContain("Asparges");
    expect(prompt).toContain("Jordbær");
    expect(prompt.toLowerCase()).toMatch(/mindst .*af/);
  });

  test("custom mandatory ingredients are passed to the LLM", async () => {
    const { service, llm, db } = makeService({ month: 6 });
    new CustomIngredientsRepository(db).add("Ris");
    new CustomIngredientsRepository(db).add("Løg");

    await service.shortForm();

    const prompt = llm.prompts[0] ?? "";
    expect(prompt).toContain("Ris");
    expect(prompt).toContain("Løg");
    expect(prompt.toLowerCase()).toMatch(/skal indeholde/);
  });

  test("excludes are passed to the LLM", async () => {
    const { service, llm, db } = makeService({ month: 6 });
    new FilterStateRepository(db).save({
      includes: [],
      excludes: ["champignon"],
    });

    await service.shortForm();

    const prompt = llm.prompts[0] ?? "";
    expect(prompt).toContain("Champignon");
    expect(prompt.toLowerCase()).toMatch(/må ikke indeholde/);
  });

  test("an unknown include slug is dropped from the filter section", async () => {
    const { service, llm, db } = makeService({ month: 6 });
    // "asparges" is valid, "spaghetti-from-the-future" is not.
    new FilterStateRepository(db).save({
      includes: ["asparges", "spaghetti-from-the-future"],
      excludes: [],
    });

    await service.shortForm();

    const prompt = llm.prompts[0] ?? "";
    expect(prompt).toContain("Asparges");
    expect(prompt).not.toContain("spaghetti-from-the-future");
  });

  test("an unknown exclude slug is dropped from the filter section", async () => {
    const { service, llm, db } = makeService({ month: 6 });
    new FilterStateRepository(db).save({
      includes: [],
      excludes: ["champignon", "made-up-ingredient"],
    });

    await service.shortForm();

    const prompt = llm.prompts[0] ?? "";
    expect(prompt).toContain("Champignon");
    expect(prompt).not.toContain("made-up-ingredient");
  });
});
