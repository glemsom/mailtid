import Database from "better-sqlite3";
import { runMigrations } from "../../src/db/migrate.js";
import { importSeasonalitySeed } from "../../src/db/seed.js";
import { SeasonalityRepository } from "../../src/db/seasonality.js";
import { MockLLMClient } from "../../src/llm/mock.js";
import { InspirationService } from "../../src/inspiration/service.js";
import type { AppDeps } from "../../src/server/app.js";

export interface TestDeps {
  deps: AppDeps;
  llm: MockLLMClient;
  db: Database.Database;
  month: number;
}

/**
 * Build a complete set of app dependencies for tests. Uses an
 * in-memory SQLite (per the PRD's "No live DB on disk" rule), a
 * {@link MockLLMClient} returning the supplied canned response, and
 * a fixed month provider so the prompt is deterministic.
 */
export function makeTestDeps(opts: {
  cannedResponse: string;
  month: number;
}): TestDeps {
  const db = new Database(":memory:");
  runMigrations(db);
  importSeasonalitySeed(db);
  const repo = new SeasonalityRepository(db);
  const llm = new MockLLMClient(opts.cannedResponse);
  const inspiration = new InspirationService(repo, llm, () => opts.month);
  return {
    deps: { seasonality: repo, inspiration },
    llm,
    db,
    month: opts.month,
  };
}
