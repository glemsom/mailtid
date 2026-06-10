import { describe, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { buildAppDeps } from "../../src/server/deps.js";
import { defaults } from "../../src/server/config.js";
import { MockLLMClient } from "../../src/llm/mock.js";

const FIVE = JSON.stringify({
  meals: [
    { title: "A", description: "a" },
    { title: "B", description: "b" },
    { title: "C", description: "c" },
    { title: "D", description: "d" },
    { title: "E", description: "e" },
  ],
});

describe("buildAppDeps", () => {
  test("opens the SQLite file, runs migrations, and imports the seed", () => {
    const dir = mkdtempSync(join(tmpdir(), "mailtid-deps-"));
    const dbPath = join(dir, "mailtid.db");
    try {
      buildAppDeps(defaults(), { dbPath, llm: new MockLLMClient(FIVE) });
      // The DB file must exist after buildAppDeps returns.
      const db = new Database(dbPath, { readonly: true });
      const row = db
        .prepare<[], { c: number }>("SELECT COUNT(*) AS c FROM seasonality")
        .get();
      expect(row?.c).toBeGreaterThan(0);
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("seed import is idempotent across two buildAppDeps calls on the same file", () => {
    const dir = mkdtempSync(join(tmpdir(), "mailtid-deps-"));
    const dbPath = join(dir, "mailtid.db");
    try {
      buildAppDeps(defaults(), { dbPath, llm: new MockLLMClient(FIVE) });
      const firstDb = new Database(dbPath, { readonly: true });
      const first = firstDb
        .prepare<[], { c: number }>("SELECT COUNT(*) AS c FROM seasonality")
        .get();
      firstDb.close();

      buildAppDeps(defaults(), { dbPath, llm: new MockLLMClient(FIVE) });
      const secondDb = new Database(dbPath, { readonly: true });
      const second = secondDb
        .prepare<[], { c: number }>("SELECT COUNT(*) AS c FROM seasonality")
        .get();
      secondDb.close();

      expect(second?.c).toBe(first?.c);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
