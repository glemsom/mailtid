import { describe, expect, test } from "vitest";
import { MockLLMClient } from "../../src/llm/mock.js";

describe("MockLLMClient", () => {
  test("returns the canned response when chat is called", async () => {
    const canned = JSON.stringify({
      meals: [{ title: "Kartoffelmos", description: "Blød mos med smør." }],
    });
    const llm = new MockLLMClient(canned);

    const out = await llm.chat("any prompt");

    expect(out).toBe(canned);
  });

  test("records every prompt handed to chat", async () => {
    const llm = new MockLLMClient("ok");

    await llm.chat("first");
    await llm.chat("second");

    expect(llm.prompts).toEqual(["first", "second"]);
  });
});
