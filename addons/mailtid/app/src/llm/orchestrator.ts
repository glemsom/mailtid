import type { LLMClient } from "./client.js";
import type { SettingsRepository } from "../db/settings.js";

/**
 * Owns the "resolve model → stream → parse" LLM call flow.
 * Extracted from {@link InspirationService} and {@link RecipeService}
 * so model resolution and streaming live in one place, and the
 * services only need to express *what* to call and *how* to parse
 * the result.
 *
 * Design C: lazy model resolution per call, a generic
 * `call<T>(prompt, parse, opts?)` method, and a public
 * `resolveActiveModel()` for test inspection. The `parse` function
 * is provided by the caller at each call site — the orchestrator
 * has no knowledge of the output shape.
 */
export class LLMOrchestrator {
  constructor(
    private readonly llm: LLMClient,
    private readonly settingsRepo?: SettingsRepository,
  ) {}

  /**
   * Stream a prompt through the active model and parse the raw
   * response text into the desired shape `T`.
   *
   * @param prompt   The full prompt text to send.
   * @param parse    Adapter that transforms the raw LLM text into `T`.
   * @param opts.onReasoning  Forwarded to the LLM stream's
   *                          `reasoning_content` callback.
   * @returns The parsed value of type `T`.
   *
   * Throws whatever `parse` throws (parser errors) and whatever
   * `llm.stream` throws (network / empty-response errors).
   */
  async call<T>(
    prompt: string,
    parse: (raw: string) => T,
    opts?: { onReasoning?: (token: string) => void },
  ): Promise<T> {
    const model = this.resolveActiveModel();
    const raw = await this.llm.stream(prompt, {
      model: model ?? undefined,
      onReasoning: opts?.onReasoning,
    });
    return parse(raw);
  }

  /**
   * Resolve the active model for an LLM call. Ordered fallback:
   * 1. The user's explicitly saved model (from settings page).
   * 2. The first free model in the cached model list.
   * 3. Any cached model (if no free models exist).
   * 4. `undefined` — lets the LLMClient pick its own hardcoded default.
   *
   * Public so tests can inspect resolution without going through
   * `call()`.
   */
  resolveActiveModel(): string | undefined {
    // 1. User's explicit choice.
    const active = this.settingsRepo?.getActiveModel();
    if (active) return active;

    // 2. Fall back to first free cached model.
    const allModels = this.settingsRepo?.listModels();
    if (!allModels || allModels.length === 0) return undefined;
    const freeModel = allModels.find((m) => m.tier === "free");
    return freeModel?.modelId ?? allModels[0]?.modelId;
  }
}
