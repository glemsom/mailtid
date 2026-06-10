import OpenAI from "openai";
import type { LLMClient } from "./client.js";

/**
 * Default OpenCode Go model used when the user has not picked one
 * (i.e. during the first run, before the settings page is wired up).
 * Picked to be cheap and capable. The settings page (slice #7) will
 * let the user override this.
 */
export const DEFAULT_OPENCODE_GO_MODEL = "opencode-go/glm-5.1";

/**
 * The base URL of the OpenCode Go provider. Mailtid uses the
 * OpenAI-compatible endpoint only — Anthropic-compatible models
 * (`/messages`) are filtered out at fetch time per CONTEXT.md.
 */
const OPENCODE_GO_BASE_URL = "https://opencode.ai/zen/go/v1";

/**
 * Real {@link LLMClient} that talks to the OpenCode Go provider
 * through the official OpenAI Node SDK. Model IDs must be passed
 * with the `opencode-go/` prefix — the model catalogue fetched by
 * slice #7 will return ids already in that shape.
 */
export class RealLLMClient implements LLMClient {
  private readonly openai: OpenAI;

  constructor(
    private readonly apiKey: string,
    private readonly defaultModel: string = DEFAULT_OPENCODE_GO_MODEL,
  ) {
    this.openai = new OpenAI({
      apiKey,
      baseURL: OPENCODE_GO_BASE_URL,
    });
  }

  async chat(prompt: string, opts?: { model?: string }): Promise<string> {
    const model = opts?.model ?? this.defaultModel;
    const completion = await this.openai.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
    });
    const choice = completion.choices[0];
    const content = choice?.message?.content;
    if (typeof content !== "string" || content.length === 0) {
      throw new Error("LLM returned an empty response");
    }
    return content;
  }
}
