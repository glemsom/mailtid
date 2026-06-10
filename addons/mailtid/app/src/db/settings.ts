import type Database from "better-sqlite3";

/**
 * A single cached model entry from the OpenCode Go catalogue.
 * `modelId` is the full prefixed id (e.g. `opencode-go/glm-5.1`),
 * ready to pass to the chat completions endpoint.
 */
export interface CachedModel {
  modelId: string;
  displayName: string;
  tier: "free" | "paid";
}

/**
 * Combined repository for the active-model setting and the model
 * cache. Both live in SQLite so the user's model choice survives
 * restarts, and the cache means the settings page renders fast
 * without a live network call on every visit.
 *
 * Backed by two tables:
 * - `active_model` — a single-row table (id = 1).
 * - `model_cache` — one row per cached model.
 */
export class SettingsRepository {
  constructor(private readonly db: Database.Database) {}

  /** The user's active model, or `null` if none has been set. */
  getActiveModel(): string | null {
    const row = this.db
      .prepare<[], { model: string | null }>(
        `SELECT model FROM active_model WHERE id = 1`,
      )
      .get();
    if (!row || row.model === null || row.model.length === 0) return null;
    return row.model;
  }

  /** Persist the user's chosen active model. */
  setActiveModel(model: string): void {
    this.db
      .prepare(
        `INSERT INTO active_model (id, model) VALUES (1, ?)
         ON CONFLICT(id) DO UPDATE SET model = excluded.model`,
      )
      .run(model);
  }

  /**
   * Replace the entire cached model list. Atomically deletes all
   * existing rows and inserts the new set inside a transaction.
   */
  replaceModelCache(models: CachedModel[]): void {
    const del = this.db.prepare(`DELETE FROM model_cache`);
    const ins = this.db.prepare(
      `INSERT INTO model_cache (model_id, display_name, tier) VALUES (?, ?, ?)`,
    );
    const tx = this.db.transaction(() => {
      del.run();
      for (const m of models) {
        ins.run(m.modelId, m.displayName, m.tier);
      }
    });
    tx();
  }

  /**
   * Return the API key stored via the in-app settings page.
   * Returns an empty string when no key has been set through the
   * web UI. Does NOT read the HA add-on options file — callers
   * should combine this with {@link MailtidConfig.opencodeApiKey}.
   */
  getApiKey(): string {
    const row = this.db
      .prepare<[], { key: string }>(
        `SELECT key FROM api_key WHERE id = 1`,
      )
      .get();
    return row?.key ?? "";
  }

  /** Persist the API key entered through the in-app settings page. */
  setApiKey(key: string): void {
    this.db
      .prepare(
        `INSERT INTO api_key (id, key) VALUES (1, ?)
         ON CONFLICT(id) DO UPDATE SET key = excluded.key`,
      )
      .run(key);
  }

  /**
   * All cached models, free first then paid, each tier sorted
   * alphabetically by display name so the picker renders stably.
   */
  listModels(): CachedModel[] {
    const rows = this.db
      .prepare<
        [],
        { model_id: string; display_name: string; tier: "free" | "paid" }
      >(
        `SELECT model_id, display_name, tier FROM model_cache
         ORDER BY (CASE tier WHEN 'free' THEN 0 ELSE 1 END),
                  display_name COLLATE NOCASE`,
      )
      .all();
    return rows.map((r) => ({
      modelId: r.model_id,
      displayName: r.display_name,
      tier: r.tier,
    }));
  }
}
