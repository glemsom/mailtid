import type { LLMClient } from "./client.js";

/**
 * In-memory test double for {@link LLMClient}. Returns a canned
 * response regardless of the prompt — the prompt is the *input* the
 * tests assert on, and the canned response is the *output* the
 * downstream code parses.
 *
 * `prompts` keeps a copy of every prompt handed to `chat`/`stream`,
 * so tests can assert on what was sent to the LLM without reaching
 * into private state.
 *
 * When `shouldThrow` is set, every call throws that error instead
 * of returning the canned response, so tests can exercise
 * network-failure and other error-handling branches.
 */
export class MockLLMClient implements LLMClient {
  public readonly prompts: string[] = [];
  /**
   * The model id passed to each `chat()`/`stream()` call, in order.
   * `undefined` means the caller did not pin a model (i.e. let the
   * client pick its default). Tests assert on this to verify the
   * service layer threads the user's active model through to the LLM.
   */
  public readonly models: (string | undefined)[] = [];
  /** When set, `chat()` and `stream()` throw this error instead of returning the canned response. */
  public shouldThrow: Error | null = null;
  /**
   * Canned reasoning tokens for `stream()`. The entire string is
   * fired as a single token to `opts.onReasoning`. Defaults to an
   * empty string (meaning no reasoning emitted) so tests that don't
   * care about reasoning behave identically to `chat()`.
   */
  public cannedReasoning: string = "";

  constructor(private readonly cannedResponse: string) {}

  async chat(prompt: string, opts?: { model?: string }): Promise<string> {
    if (this.shouldThrow) throw this.shouldThrow;
    this.prompts.push(prompt);
    this.models.push(opts?.model);
    return this.cannedResponse;
  }

  async stream(
    prompt: string,
    opts?: { model?: string; onReasoning?: (token: string) => void },
  ): Promise<string> {
    if (this.shouldThrow) throw this.shouldThrow;
    this.prompts.push(prompt);
    this.models.push(opts?.model);
    if (this.cannedReasoning.length > 0) {
      opts?.onReasoning?.(this.cannedReasoning);
    }
    return this.cannedResponse;
  }
}
