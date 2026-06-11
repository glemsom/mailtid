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

  test("stream returns the canned response", async () => {
    const canned = JSON.stringify({
      meals: [{ title: "Kartoffelmos", description: "Blød mos med smør." }],
    });
    const llm = new MockLLMClient(canned);

    const out = await llm.stream("any prompt");

    expect(out).toBe(canned);
  });

  test("stream records prompt and model identically to chat", async () => {
    const llm = new MockLLMClient("ok");

    await llm.stream("first", { model: "opencode-go/glm-5.1" });
    await llm.stream("second");

    expect(llm.prompts).toEqual(["first", "second"]);
    expect(llm.models).toEqual(["opencode-go/glm-5.1", undefined]);
  });

  test("stream fires onReasoning with cannedReasoning tokens (default empty)", async () => {
    const llm = new MockLLMClient("ok");
    const reasoning: string[] = [];

    await llm.stream("test", { onReasoning: (t) => reasoning.push(t) });

    // Default cannedReasoning is empty string, so no tokens fired.
    expect(reasoning).toEqual([]);
  });

  test("stream fires onReasoning with custom cannedReasoning tokens", async () => {
    const llm = new MockLLMClient("ok");
    llm.cannedReasoning = "Jeg tænker... ja, det virker!";
    const reasoning: string[] = [];

    await llm.stream("test", { onReasoning: (t) => reasoning.push(t) });

    expect(reasoning).toEqual(["Jeg tænker... ja, det virker!"]);
  });

  test("stream does not crash when onReasoning is omitted", async () => {
    const llm = new MockLLMClient("ok");
    llm.cannedReasoning = "some reasoning";

    const out = await llm.stream("test");

    expect(out).toBe("ok");
  });

  test("stream still throws when shouldThrow is set", async () => {
    const llm = new MockLLMClient("ok");
    llm.shouldThrow = new Error("network down");

    await expect(llm.stream("test")).rejects.toThrow("network down");
  });
});
