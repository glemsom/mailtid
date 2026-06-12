import { describe, expect, test } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../../src/db/migrate.js";
import { importSeasonalitySeed } from "../../src/db/seed.js";
import { SeasonalityRepository } from "../../src/db/seasonality.js";
import { SettingsRepository } from "../../src/db/settings.js";
import { CookedHistoryRepository } from "../../src/db/cooked-history.js";
import { MockLLMClient } from "../../src/llm/mock.js";
import { LLMOrchestrator } from "../../src/llm/orchestrator.js";
import { InspirationService } from "../../src/inspiration/service.js";

const CANNED = JSON.stringify({
  meals: [
    { title: "T1", description: "D1", ingredients: [{ name: "X", amount: "1", unit: "stk" }], steps: ["Gør klar."], time_minutes: 10 },
    { title: "T2", description: "D2", ingredients: [{ name: "X", amount: "1", unit: "stk" }], steps: ["Gør klar."], time_minutes: 10 },
    { title: "T3", description: "D3", ingredients: [{ name: "X", amount: "1", unit: "stk" }], steps: ["Gør klar."], time_minutes: 10 },
    { title: "T4", description: "D4", ingredients: [{ name: "X", amount: "1", unit: "stk" }], steps: ["Gør klar."], time_minutes: 10 },
    { title: "T5", description: "D5", ingredients: [{ name: "X", amount: "1", unit: "stk" }], steps: ["Gør klar."], time_minutes: 10 },
  ],
});

describe("InspirationService model selection", () => {
  test("uses activeModel from SettingsRepository when set", async () => {
    const db = new Database(":memory:");
    runMigrations(db);
    importSeasonalitySeed(db);
    const seasonality = new SeasonalityRepository(db);
    const settings = new SettingsRepository(db);
    const cookedHistory = new CookedHistoryRepository(db);
    const llm = new MockLLMClient(CANNED);

    // User selects a model on the settings page
    settings.setActiveModel("opencode-go/custom-model");

    const orchestrator = new LLMOrchestrator(llm, settings);
    const service = new InspirationService(
      seasonality, orchestrator, () => 6,
      undefined, undefined, cookedHistory,
    );

    await service.shortForm();

    // The LLM should have been called with the custom model
    expect(llm.models).toHaveLength(1);
    expect(llm.models[0]).toBe("opencode-go/custom-model");
  });

  test("passes undefined model when no activeModel is set (let LLM pick default)", async () => {
    const db = new Database(":memory:");
    runMigrations(db);
    importSeasonalitySeed(db);
    const seasonality = new SeasonalityRepository(db);
    const settings = new SettingsRepository(db);
    const cookedHistory = new CookedHistoryRepository(db);
    const llm = new MockLLMClient(CANNED);

    // No active model set — getActiveModel() returns null
    const orchestrator = new LLMOrchestrator(llm, settings);
    const service = new InspirationService(
      seasonality, orchestrator, () => 6,
      undefined, undefined, cookedHistory,
    );

    await service.shortForm();

    // When no model is set, opts.model should be undefined → LLM falls back to its own default
    expect(llm.models).toHaveLength(1);
    expect(llm.models[0]).toBeUndefined();
  });

  test("uses updated model after change via settings page", async () => {
    const db = new Database(":memory:");
    runMigrations(db);
    importSeasonalitySeed(db);
    const seasonality = new SeasonalityRepository(db);
    const settings = new SettingsRepository(db);
    const cookedHistory = new CookedHistoryRepository(db);
    const llm = new MockLLMClient(CANNED);

    const orchestrator = new LLMOrchestrator(llm, settings);
    const service = new InspirationService(
      seasonality, orchestrator, () => 6,
      undefined, undefined, cookedHistory,
    );

    // First call with no model set
    await service.shortForm();
    expect(llm.models[0]).toBeUndefined();

    // User saves a model via the settings page
    settings.setActiveModel("opencode-go/new-model");

    // Next call should use the new model
    await service.shortForm();
    expect(llm.models[1]).toBe("opencode-go/new-model");
  });

  test("model is threaded through when settingsRepo is provided", async () => {
    const db = new Database(":memory:");
    runMigrations(db);
    importSeasonalitySeed(db);
    const seasonality = new SeasonalityRepository(db);
    const settings = new SettingsRepository(db);
    const cookedHistory = new CookedHistoryRepository(db);
    const llm = new MockLLMClient(CANNED);

    settings.setActiveModel("opencode-go/test-model");

    const orchestrator = new LLMOrchestrator(llm, settings);
    const service = new InspirationService(
      seasonality, orchestrator, () => 6,
      undefined, undefined, cookedHistory,
    );

    await service.shortForm();

    expect(llm.models[0]).toBe("opencode-go/test-model");
  });

  test("falls back to first free cached model when no activeModel is set", async () => {
    const db = new Database(":memory:");
    runMigrations(db);
    importSeasonalitySeed(db);
    const seasonality = new SeasonalityRepository(db);
    const settings = new SettingsRepository(db);
    const cookedHistory = new CookedHistoryRepository(db);
    const llm = new MockLLMClient(CANNED);

    // Models are cached (e.g. after a refresh) but user never picked one.
    settings.replaceModelCache([
      { modelId: "opencode-go/free-model", displayName: "Free", tier: "free" },
      { modelId: "opencode-go/paid-model", displayName: "Paid", tier: "paid" },
    ]);

    const orchestrator = new LLMOrchestrator(llm, settings);
    const service = new InspirationService(
      seasonality, orchestrator, () => 6,
      undefined, undefined, cookedHistory,
    );

    await service.shortForm();

    // Should pick the first free model from the cache, not undefined.
    expect(llm.models).toHaveLength(1);
    expect(llm.models[0]).toBe("opencode-go/free-model");
  });

  test("falls back to any cached model when no free models exist", async () => {
    const db = new Database(":memory:");
    runMigrations(db);
    importSeasonalitySeed(db);
    const seasonality = new SeasonalityRepository(db);
    const settings = new SettingsRepository(db);
    const cookedHistory = new CookedHistoryRepository(db);
    const llm = new MockLLMClient(CANNED);

    // Only paid models cached — no free tier.
    settings.replaceModelCache([
      { modelId: "opencode-go/paid-1", displayName: "Paid 1", tier: "paid" },
      { modelId: "opencode-go/paid-2", displayName: "Paid 2", tier: "paid" },
    ]);

    const orchestrator = new LLMOrchestrator(llm, settings);
    const service = new InspirationService(
      seasonality, orchestrator, () => 6,
      undefined, undefined, cookedHistory,
    );

    await service.shortForm();

    // Should fall back to the first cached model (even if paid).
    expect(llm.models).toHaveLength(1);
    expect(llm.models[0]).toBe("opencode-go/paid-1");
  });

  test("no crash when settingsRepo is undefined (backwards compat)", async () => {
    const db = new Database(":memory:");
    runMigrations(db);
    importSeasonalitySeed(db);
    const seasonality = new SeasonalityRepository(db);
    const cookedHistory = new CookedHistoryRepository(db);
    const llm = new MockLLMClient(CANNED);

    // No settingsRepo passed — orchestrator created without settings
    const orchestrator = new LLMOrchestrator(llm);
    const service = new InspirationService(
      seasonality, orchestrator, () => 6,
      undefined, undefined, cookedHistory,
    );

    await service.shortForm();

    // Model should be undefined (falls back to LLM default)
    expect(llm.models[0]).toBeUndefined();
  });
});
