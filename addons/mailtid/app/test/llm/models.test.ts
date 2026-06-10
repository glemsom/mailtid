import { describe, expect, test } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../../src/db/migrate.js";
import { SettingsRepository } from "../../src/db/settings.js";
import { refreshModelCache } from "../../src/llm/models.js";

function makeSettings(): SettingsRepository {
  const db = new Database(":memory:");
  runMigrations(db);
  return new SettingsRepository(db);
}

describe("refreshModelCache", () => {
  test("returns early when API key is empty", async () => {
    const settings = makeSettings();
    const status = await refreshModelCache("", settings);
    expect(status).toMatch(/nøgle/i);
    expect(settings.listModels()).toHaveLength(0);
  });

  test("uses the apiKey argument for the Authorization header", async () => {
    // Regression: the caller (deps.ts) must pass a live key, not a
    // stale captured empty string. Verify the key makes it into the
    // outgoing fetch call.
    const settings = makeSettings();
    const originalFetch = globalThis.fetch;
    let authHeader: string | null = null;
    try {
      globalThis.fetch = ((_url: string, init?: RequestInit) => {
        authHeader = (init?.headers as Record<string, string> | undefined)
          ?.authorization ?? null;
        return Promise.resolve(new Response(JSON.stringify({ data: [] }), { status: 200 }));
      }) as typeof globalThis.fetch;
      await refreshModelCache("sk-test-key", settings);
      expect(authHeader).toBe("Bearer sk-test-key");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("survives model entries with missing endpoint", async () => {
    // Regression: OpenCode Go may return model entries that lack an
    // `endpoint` field (e.g. provider-level metadata entries).
    // The Anthropic filter must not throw on `undefined` endpoints.
    const settings = makeSettings();
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = (() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              data: [
                { id: "no-endpoint", display_name: "No EP" },
                { id: "normal", endpoint: "/v1/chat/completions", display_name: "Normal" },
                { id: "anthropic", endpoint: "/v1/messages", display_name: "Anthropic" },
              ],
            }),
            { status: 200 },
          ),
        )) as typeof globalThis.fetch;
      const status = await refreshModelCache("sk-test-key", settings);
      expect(status).toMatch(/Hentet 2 modeller/);
      const cached = settings.listModels();
      expect(cached).toHaveLength(2);
      const ids = cached.map((m) => m.modelId);
      expect(ids).toContain("no-endpoint");
      expect(ids).toContain("normal");
      expect(ids).not.toContain("anthropic");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

/**
 * The Anthropic endpoint filter is applied inside `refreshModelCache`.
 * We verify the logic through targeted pure-function assertions on
 * the extracted helper, so we never touch the network in tests.
 */
describe("Anthropic model filter (pure logic)", () => {
  /**
   * Duplicated from models.ts for test-isolation. Keep in sync.
   */
  function isAnthropicEndpoint(raw: string): boolean {
    const segments = raw.replace(/\/+$/, "").split("/");
    const last = segments[segments.length - 1];
    const secondLast = segments.length >= 2 ? segments[segments.length - 2] : "";
    return last === "messages" || secondLast === "messages";
  }

  test("filters out endpoints ending in /messages", () => {
    expect(isAnthropicEndpoint("/v1/messages")).toBe(true);
    expect(isAnthropicEndpoint("/zen/go/v1/messages")).toBe(true);
    expect(isAnthropicEndpoint("messages")).toBe(true);
  });

  test("keeps chat/completions endpoints", () => {
    expect(isAnthropicEndpoint("/v1/chat/completions")).toBe(false);
    expect(isAnthropicEndpoint("/zen/go/v1/chat/completions")).toBe(false);
    expect(isAnthropicEndpoint("chat/completions")).toBe(false);
  });

  test("handles trailing slash", () => {
    expect(isAnthropicEndpoint("/v1/messages/")).toBe(true);
    expect(isAnthropicEndpoint("/chat/completions/")).toBe(false);
  });
});
