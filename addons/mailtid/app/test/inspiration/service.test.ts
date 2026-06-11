import { describe, expect, test } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../../src/db/migrate.js";
import { importSeasonalitySeed } from "../../src/db/seed.js";
import { SeasonalityRepository } from "../../src/db/seasonality.js";
import { FilterStateRepository } from "../../src/db/filter-state.js";
import { CustomIngredientsRepository } from "../../src/db/custom-ingredients.js";
import { ProfileRepository } from "../../src/db/profile.js";
import { MockLLMClient } from "../../src/llm/mock.js";
import {
  InspirationService,
  parseShortFormResponse,
  type InspirationServiceFilterDeps,
} from "../../src/inspiration/service.js";
import { CookedHistoryRepository } from "../../src/db/cooked-history.js";

function makeService(opts: {
  cannedResponse: string;
  month: number;
}): { service: InspirationService; llm: MockLLMClient; db: Database.Database } {
  const db = new Database(":memory:");
  runMigrations(db);
  importSeasonalitySeed(db);
  const repo = new SeasonalityRepository(db);
  const llm = new MockLLMClient(opts.cannedResponse);
  const cookedHistory = new CookedHistoryRepository(db);
  const service = new InspirationService(
    repo,
    llm,
    () => opts.month,
    undefined,
    undefined,
    undefined,
    cookedHistory,
  );
  return { service, llm, db };
}

function makeCannedMeal(title: string, description: string) {
  return {
    title,
    description,
    ingredients: [
      { name: "Hovedingrediens", amount: "500", unit: "g" },
      { name: "Salt", amount: "1", unit: "tsk" },
    ],
    steps: [
      "Forbered ingredienserne.",
      "Tilbered retten.",
      "Server og nyd.",
    ],
    time_minutes: 30,
  };
}

const CANNED = JSON.stringify({
  meals: [
    makeCannedMeal("Jordbærtærte", "Sprød tærte med friske jordbær."),
    makeCannedMeal("Aspargessuppe", "Cremet suppe med grønne asparges."),
    makeCannedMeal("Kartoffelsalat", "Klassisk kartoffelsalat med dild."),
    makeCannedMeal("Tomatsalat", "Frisk salat med modne tomater."),
    makeCannedMeal("Rabarberkompot", "Sød kompot af årets rabarber."),
  ],
});

describe("InspirationService.shortForm", () => {
  test("returns 5 short-form Meal Inspirations from the LLM response", async () => {
    const { service } = makeService({ cannedResponse: CANNED, month: 6 });

    const meals = await service.shortForm();

    expect(meals).toHaveLength(5);
    expect(meals[0]?.title).toBe("Jordbærtærte");
    expect(meals[0]?.description).toMatch(/jordbær/);
    expect(meals[0]?.ingredients).toHaveLength(2);
    expect(meals[0]?.steps).toHaveLength(3);
    expect(meals[0]?.timeMinutes).toBe(30);
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

  test("includes cooked-history in the prompt when meals have been cooked in the last 14 days", async () => {
    const { service, llm, db } = makeService({ cannedResponse: CANNED, month: 6 });

    // Stamp a meal as cooked just now.
    const cookedHistory = new CookedHistoryRepository(db);
    cookedHistory.stamp({
      title: "Jordbærtærte",
      description: "Sprød tærte med friske jordbær.",
    });

    await service.shortForm();

    expect(llm.prompts).toHaveLength(1);
    const prompt = llm.prompts[0] ?? "";
    expect(prompt).toContain("Tidligere lavet");
    expect(prompt).toContain("Jordbærtærte");
    expect(prompt).toContain("undgå");
  });

  test("omits cooked-history section when nothing is cooked", async () => {
    const { service, llm } = makeService({ cannedResponse: CANNED, month: 6 });

    await service.shortForm();

    const prompt = llm.prompts[0] ?? "";
    expect(prompt).not.toContain("Tidligere lavet");
  });

  test("calls stream() not chat()", async () => {
    const { service, llm } = makeService({ cannedResponse: CANNED, month: 6 });

    // Track which method was called by spying.
    let streamCalled = false;
    let chatCalled = false;
    const origStream = llm.stream.bind(llm);
    const origChat = llm.chat.bind(llm);
    llm.stream = async (...args: Parameters<typeof origStream>) => {
      streamCalled = true;
      return origStream(...args);
    };
    llm.chat = async (...args: Parameters<typeof origChat>) => {
      chatCalled = true;
      return origChat(...args);
    };

    await service.shortForm();

    expect(streamCalled).toBe(true);
    expect(chatCalled).toBe(false);
  });

  test("wires onReasoning callback through to LLM stream", async () => {
    const { service, llm } = makeService({ cannedResponse: CANNED, month: 6 });
    llm.cannedReasoning = "Jeg tænker mig om...";
    const reasoning: string[] = [];

    await service.shortForm({ onReasoning: (t) => reasoning.push(t) });

    expect(reasoning).toEqual(["Jeg tænker mig om..."]);
  });

  test("onReasoning is optional — no crash when omitted", async () => {
    const { service, llm } = makeService({ cannedResponse: CANNED, month: 6 });
    llm.cannedReasoning = "some reasoning";

    const meals = await service.shortForm();
    expect(meals).toHaveLength(5);
  });

  test("onStatus still works when passed via opts object", async () => {
    const statuses: string[] = [];
    const { service } = makeService({ cannedResponse: CANNED, month: 6 });

    await service.shortForm({ onStatus: (s) => statuses.push(s) });

    expect(statuses).toHaveLength(3);
    expect(statuses[0]).toBe("Henter ingredienser og profil...");
    expect(statuses[2]).toBe("AI tænker...");
  });

});

describe("shortForm status messages", () => {
  test("emits three status phases: fetch, build-stats, AI-call", async () => {
    const statuses: string[] = [];
    const { service } = makeService({ cannedResponse: CANNED, month: 6 });

    await service.shortForm({ onStatus: (status) => statuses.push(status) });

    expect(statuses).toHaveLength(3);
    expect(statuses[0]).toBe("Henter ingredienser og profil...");
    expect(statuses[1]).toMatch(/^Bygger forespørgsel: \d+ råvarer, \d+ filtre/);
    expect(statuses[2]).toBe("AI tænker...");
  });

  test("build-stats message includes ingredient count for the month", async () => {
    const statuses: string[] = [];
    const { service } = makeService({ cannedResponse: CANNED, month: 6 });

    await service.shortForm({ onStatus: (status) => statuses.push(status) });

    // June has a known set of ingredients — the exact count doesn't
    // matter, but it must appear in the message.
    const buildMsg = statuses[1] ?? "";
    const match = buildMsg.match(/^Bygger forespørgsel: (\d+) råvarer/);
    expect(match).not.toBeNull();
    const count = Number(match![1]);
    expect(count).toBeGreaterThan(0);
  });

  test("build-stats message includes filter constraint count when filters are active", async () => {
    const db = new Database(":memory:");
    runMigrations(db);
    importSeasonalitySeed(db);
    const repo = new SeasonalityRepository(db);
    const filterState = new FilterStateRepository(db);
    const customIngredients = new CustomIngredientsRepository(db);
    const profile = new ProfileRepository(db);
    const llm = new MockLLMClient(CANNED);
    const cookedHistory = new CookedHistoryRepository(db);

    // Save a profile so profile stats appear.
    profile.save({
      dietaryPattern: "vegetarian",
      allergies: [],
      dislikes: "",
    });

    // Activate some filters.
    filterState.save({ includes: ["jordbaer", "asparges"], excludes: ["champignon"] });
    customIngredients.add("ris");

    const service = new InspirationService(
      repo,
      llm,
      () => 6,
      { filterState, customIngredients },
      profile,
      undefined,
      cookedHistory,
    );

    const statuses: string[] = [];
    await service.shortForm({ onStatus: (status) => statuses.push(status) });

    const buildMsg = statuses[1] ?? "";
    // 2 includes + 1 custom + 1 exclude = 4 filter constraints
    expect(buildMsg).toMatch(/^Bygger forespørgsel: \d+ råvarer, 4 filtre/);
    expect(buildMsg).toContain("kostprofil: vegetar");
  });

  test("build-stats message omits dietary pattern when profile is not set", async () => {
    const statuses: string[] = [];
    const { service } = makeService({ cannedResponse: CANNED, month: 6 });

    await service.shortForm({ onStatus: (status) => statuses.push(status) });

    const buildMsg = statuses[1] ?? "";
    expect(buildMsg).not.toContain("kostprofil:");
  });

  test("build-stats message includes dietary pattern name when profile is set", async () => {
    const db = new Database(":memory:");
    runMigrations(db);
    importSeasonalitySeed(db);
    const repo = new SeasonalityRepository(db);
    const profile = new ProfileRepository(db);
    const llm = new MockLLMClient(CANNED);
    const cookedHistory = new CookedHistoryRepository(db);

    profile.save({
      dietaryPattern: "vegan",
      allergies: [],
      dislikes: "",
    });

    const service = new InspirationService(
      repo,
      llm,
      () => 6,
      undefined,
      profile,
      undefined,
      cookedHistory,
    );

    const statuses: string[] = [];
    await service.shortForm({ onStatus: (status) => statuses.push(status) });

    const buildMsg = statuses[1] ?? "";
    expect(buildMsg).toContain("kostprofil: vegan");
  });

  test("status callback is optional — no crash when omitted", async () => {
    const { service } = makeService({ cannedResponse: CANNED, month: 6 });
    const meals = await service.shortForm();
    expect(meals).toHaveLength(5);
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

  test("throws on a meal with missing ingredients", () => {
    const bad = JSON.stringify({
      meals: [{ title: "X", description: "Y" }],
    });
    expect(() => parseShortFormResponse(bad)).toThrow();
  });

  test("throws on garbage input", () => {
    expect(() => parseShortFormResponse("not json at all")).toThrow();
  });
});
