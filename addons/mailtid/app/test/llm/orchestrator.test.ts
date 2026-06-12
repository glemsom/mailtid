import { describe, expect, test } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../../src/db/migrate.js";
import { SettingsRepository } from "../../src/db/settings.js";
import { MockLLMClient } from "../../src/llm/mock.js";
import { LLMOrchestrator } from "../../src/llm/orchestrator.js";

const CANNED = '{"ok":true}';

function makeOrchestrator(opts?: {
  settings?: SettingsRepository;
  cannedResponse?: string;
}) {
  const db = new Database(":memory:");
  runMigrations(db);
  const settings = opts?.settings ?? new SettingsRepository(db);
  const llm = new MockLLMClient(opts?.cannedResponse ?? CANNED);
  const orchestrator = new LLMOrchestrator(llm, settings);
  return { orchestrator, llm, settings, db };
}

describe("LLMOrchestrator", () => {
  describe("resolveActiveModel", () => {
    test("returns user's active model when set", () => {
      const { orchestrator, settings } = makeOrchestrator();
      settings.setActiveModel("opencode-go/my-model");

      expect(orchestrator.resolveActiveModel()).toBe("opencode-go/my-model");
    });

    test("falls back to first free cached model when no active model is set", () => {
      const { orchestrator, settings } = makeOrchestrator();
      settings.replaceModelCache([
        { modelId: "opencode-go/paid-1", displayName: "Paid 1", tier: "paid" },
        { modelId: "opencode-go/free-1", displayName: "Free 1", tier: "free" },
        { modelId: "opencode-go/free-2", displayName: "Free 2", tier: "free" },
      ]);

      expect(orchestrator.resolveActiveModel()).toBe("opencode-go/free-1");
    });

    test("falls back to any cached model when no free models exist", () => {
      const { orchestrator, settings } = makeOrchestrator();
      settings.replaceModelCache([
        { modelId: "opencode-go/paid-1", displayName: "Paid 1", tier: "paid" },
        { modelId: "opencode-go/paid-2", displayName: "Paid 2", tier: "paid" },
      ]);

      expect(orchestrator.resolveActiveModel()).toBe("opencode-go/paid-1");
    });

    test("returns undefined when no settings repo provided", () => {
      const db = new Database(":memory:");
      runMigrations(db);
      const llm = new MockLLMClient(CANNED);
      const orchestrator = new LLMOrchestrator(llm);

      expect(orchestrator.resolveActiveModel()).toBeUndefined();
    });

    test("returns undefined when no models cached and no active model set", () => {
      const { orchestrator } = makeOrchestrator();

      expect(orchestrator.resolveActiveModel()).toBeUndefined();
    });
  });

  describe("call", () => {
    test("resolves model, streams prompt, parses response, returns parsed value", async () => {
      const { orchestrator, llm, settings } = makeOrchestrator();
      settings.setActiveModel("opencode-go/custom-model");

      const result = await orchestrator.call("test prompt", (raw) => ({
        parsed: JSON.parse(raw) as { ok: boolean },
      }));

      expect(result.parsed.ok).toBe(true);
      expect(llm.prompts).toHaveLength(1);
      expect(llm.prompts[0]).toBe("test prompt");
      expect(llm.models).toHaveLength(1);
      expect(llm.models[0]).toBe("opencode-go/custom-model");
    });

    test("propagates parser errors to caller", async () => {
      const { orchestrator } = makeOrchestrator();

      await expect(
        orchestrator.call("prompt", () => {
          throw new Error("parser exploded");
        }),
      ).rejects.toThrow("parser exploded");
    });

    test("propagates LLM errors to caller", async () => {
      const { orchestrator, llm } = makeOrchestrator();
      llm.shouldThrow = new Error("network failure");

      await expect(
        orchestrator.call("prompt", JSON.parse),
      ).rejects.toThrow("network failure");
    });

    test("threads onReasoning callback through to LLM stream", async () => {
      const { orchestrator, llm } = makeOrchestrator();
      llm.cannedReasoning = "thinking...";
      const reasoning: string[] = [];

      await orchestrator.call("prompt", JSON.parse, {
        onReasoning: (t) => reasoning.push(t),
      });

      expect(reasoning).toEqual(["thinking..."]);
    });

    test("passes undefined model when resolveActiveModel returns undefined", async () => {
      const { orchestrator, llm } = makeOrchestrator();
      // No active model, no cached models → resolveActiveModel() returns undefined

      await orchestrator.call("prompt", JSON.parse);

      expect(llm.models[0]).toBeUndefined();
    });
  });
});
