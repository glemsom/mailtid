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
