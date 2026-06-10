import type { LLMClient } from "./client.js";

/**
 * In-memory test double for {@link LLMClient}. Returns a canned
 * response regardless of the prompt — the prompt is the *input* the
 * tests assert on, and the canned response is the *output* the
 * downstream code parses.
 *
 * `recordPrompts` keeps a copy of every prompt handed to `chat`, so
 * tests can assert on what was sent to the LLM without reaching
 * into private state.
 *
 * When `shouldThrow` is set, every `chat()` call throws that error
 * instead of returning the canned response, so tests can exercise
 * network-failure and other error-handling branches.
 */
export class MockLLMClient implements LLMClient {
  public readonly prompts: string[] = [];
  /** When set, `chat()` throws this error instead of returning the canned response. */
  public shouldThrow: Error | null = null;

  constructor(private readonly cannedResponse: string) {}

  async chat(prompt: string): Promise<string> {
    if (this.shouldThrow) throw this.shouldThrow;
    this.prompts.push(prompt);
    return this.cannedResponse;
  }
}
