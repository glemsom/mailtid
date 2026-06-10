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
 */
export class MockLLMClient implements LLMClient {
  public readonly prompts: string[] = [];

  constructor(private readonly cannedResponse: string) {}

  async chat(prompt: string): Promise<string> {
    this.prompts.push(prompt);
    return this.cannedResponse;
  }
}
