import { describe, expect, test } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../../src/db/migrate.js";
import { importSeasonalitySeed } from "../../src/db/seed.js";
import { SeasonalityRepository } from "../../src/db/seasonality.js";
import { MockLLMClient } from "../../src/llm/mock.js";
import {
  InspirationService,
  parseShortFormResponse,
} from "../../src/inspiration/service.js";

function makeService(opts: {
  cannedResponse: string;
  month: number;
}): { service: InspirationService; llm: MockLLMClient } {
  const db = new Database(":memory:");
  runMigrations(db);
  importSeasonalitySeed(db);
  const repo = new SeasonalityRepository(db);
  const llm = new MockLLMClient(opts.cannedResponse);
  const service = new InspirationService(repo, llm, () => opts.month);
  return { service, llm };
}

const CANNED = JSON.stringify({
  meals: [
    { title: "Jordbærtærte", description: "Sprød tærte med friske jordbær." },
    { title: "Aspargessuppe", description: "Cremet suppe med grønne asparges." },
    { title: "Kartoffelsalat", description: "Klassisk kartoffelsalat med dild." },
    { title: "Tomatsalat", description: "Frisk salat med modne tomater." },
    { title: "Rabarberkompot", description: "Sød kompot af årets rabarber." },
  ],
});

describe("InspirationService.shortForm", () => {
  test("returns 5 short-form Meal Inspirations from the LLM response", async () => {
    const { service } = makeService({ cannedResponse: CANNED, month: 6 });

    const meals = await service.shortForm();

    expect(meals).toHaveLength(5);
    expect(meals[0]?.title).toBe("Jordbærtærte");
    expect(meals[0]?.description).toMatch(/jordbær/);
  });

  test("sends a prompt to the LLM that names the current month and the in-season ingredients", async () => {
    const { service, llm } = makeService({ cannedResponse: CANNED, month: 6 });

    await service.shortForm();

    expect(llm.prompts).toHaveLength(1);
    const prompt = llm.prompts[0] ?? "";
    expect(prompt).toContain("Juni");
    expect(prompt).toContain("måned 6");
    // Spot-check: at least one June-only ingredient is in the prompt.
    expect(prompt).toContain("Jordbær");
  });
});

describe("parseShortFormResponse", () => {
  test("parses a well-formed JSON object", () => {
    const parsed = parseShortFormResponse(CANNED);
    expect(parsed).toHaveLength(5);
  });

  test("strips ```json fences if the model added them", () => {
    const wrapped = "```json\n" + CANNED + "\n```";
    expect(parseShortFormResponse(wrapped)).toHaveLength(5);
  });

  test("ignores prose before/after the JSON object", () => {
    const wrapped = "Her er forslagene:\n" + CANNED + "\nGod fornøjelse!";
    expect(parseShortFormResponse(wrapped)).toHaveLength(5);
  });

  test("throws on a missing meals array", () => {
    expect(() => parseShortFormResponse(JSON.stringify({ foo: 1 }))).toThrow();
  });

  test("throws on a meal with a missing description", () => {
    const bad = JSON.stringify({ meals: [{ title: "X" }] });
    expect(() => parseShortFormResponse(bad)).toThrow();
  });

  test("throws on garbage input", () => {
    expect(() => parseShortFormResponse("not json at all")).toThrow();
  });
});
