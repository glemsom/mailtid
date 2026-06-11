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
 *
 * The API key is accepted as either a static string or a
 * zero-argument provider function. When a provider is used, the
 * key is re-read before every `chat()` call, so the user can
 * save or change the key through the in-app settings page without
 * restarting the container.
 */
export class RealLLMClient implements LLMClient {
  private readonly openai: OpenAI;
  private readonly keyProvider: () => string;

  constructor(
    apiKey: string | (() => string),
    private readonly defaultModel: string = DEFAULT_OPENCODE_GO_MODEL,
  ) {
    this.keyProvider =
      typeof apiKey === "function" ? apiKey : () => apiKey;
    this.openai = new OpenAI({
      apiKey: this.keyProvider(),
      baseURL: OPENCODE_GO_BASE_URL,
    });
  }

  async chat(prompt: string, opts?: { model?: string }): Promise<string> {
    // Re-read the key before every request so changes made through
    // the in-app settings page take effect without a restart.
    this.openai.apiKey = this.keyProvider();
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

  async stream(
    prompt: string,
    opts?: { model?: string; onReasoning?: (token: string) => void },
  ): Promise<string> {
    // Re-read the key before every request so changes made through
    // the in-app settings page take effect without a restart.
    this.openai.apiKey = this.keyProvider();
    const model = opts?.model ?? this.defaultModel;
    const stream = await this.openai.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      stream: true,
    });
    let content = "";
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (delta?.content) {
        content += delta.content;
      }
      // `reasoning_content` is not yet in the OpenAI SDK types but
      // is emitted by reasoning-capable models (OpenCode Go, Groq,
      // etc.). Access it via a type assertion.
      const reasoning = (delta as Record<string, unknown> | undefined)
        ?.reasoning_content;
      if (typeof reasoning === "string" && reasoning.length > 0) {
        opts?.onReasoning?.(reasoning);
      }
    }
    if (content.length === 0) {
      throw new Error("LLM returned an empty response");
    }
    return content;
  }
}
