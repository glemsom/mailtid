/**
 * The boundary Mailtid talks to its LLM through.
 *
 * The interface is intentionally tiny: send a prompt, get the model's
 * raw text back. Parsing, schema enforcement, and retry logic live
 * in the callers (the inspiration service, the recipe service), not
 * the transport — that keeps the transport easy to stub in tests and
 * easy to swap (real OpenAI client, mock, fixture).
 *
 * The mailtid RealLLMClient always points at the OpenCode Go provider
 * at `https://opencode.ai/zen/go/v1` and prefixes model IDs with
 * `opencode-go/`. Anthropic-compatible models are filtered out at
 * fetch time, so any model reaching this method is safe to call.
 */
export interface LLMClient {
  /**
   * Send a chat completion prompt and return the model's raw text
   * response. The caller is responsible for parsing it.
   *
   * @param prompt The full prompt to send. The LLMClient does not
   *               wrap it in a system/user split — the prompt module
   *               has already done that.
   * @param opts.model Optional model override. Must be a fully
   *                   prefixed OpenCode Go model id
   *                   (e.g. `opencode-go/glm-5.1`). If omitted, the
   *                   client's default model is used.
   */
  chat(prompt: string, opts?: { model?: string }): Promise<string>;
}
