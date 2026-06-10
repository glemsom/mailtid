import { describe, expect, test, vi } from "vitest";
import { createApp } from "../../src/server/app.js";
import { makeTestDeps } from "../helpers/deps.js";

const FIVE_MEALS = JSON.stringify({
  meals: [
    { title: "Test ret 1", description: "En beskrivelse." },
    { title: "Test ret 2", description: "En anden beskrivelse." },
    { title: "Test ret 3", description: "Tredje beskrivelse." },
    { title: "Test ret 4", description: "Fjerde beskrivelse." },
    { title: "Test ret 5", description: "Femte beskrivelse." },
  ],
});

describe("Error handling: missing API key", () => {
  test("GET / returns home page with missing-key message when api key is empty", async () => {
    const { deps } = makeTestDeps({ cannedResponse: FIVE_MEALS, month: 6, hasApiKey: false });
    const app = createApp(deps);

    const res = await app.request("http://localhost/");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("OpenCode API-nøgle");
    expect(html).toContain("add-on-indstillingerne");
  });

  test("GET / does not show missing-key message when api key is set", async () => {
    const { deps } = makeTestDeps({ cannedResponse: FIVE_MEALS, month: 6, hasApiKey: true });
    const app = createApp(deps);

    const res = await app.request("http://localhost/");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).not.toContain("OpenCode API-nøgle");
  });

  test("POST /api/inspiration returns 503 when API key is missing", async () => {
    const { deps } = makeTestDeps({ cannedResponse: FIVE_MEALS, month: 6, hasApiKey: false });
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/inspiration", {
      method: "POST",
    });
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("API-nøgle");
  });
});

describe("Error handling: LLM throws", () => {
  test("POST /api/inspiration returns 502 when the LLM call throws a network error", async () => {
    const { deps, llm } = makeTestDeps({ cannedResponse: FIVE_MEALS, month: 6 });
    llm.shouldThrow = new Error("Connection refused");
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/inspiration", {
      method: "POST",
    });
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Kunne ikke få forslag");
  });

  test("POST /api/inspiration/recipe returns 502 when the LLM call throws", async () => {
    const CANNED = JSON.stringify({
      title: "Test",
      description: "Test",
      ingredients: [{ name: "X", amount: "1", unit: "stk" }],
      steps: ["Gør det."],
      time_minutes: 10,
    });
    const { deps, llm } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    llm.shouldThrow = new Error("Timeout");
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/inspiration/recipe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Test",
        description: "Test",
      }),
    });
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Kunne ikke få forslag");
  });

  test("LLM throw is logged at WARN level", async () => {
    const { deps, llm } = makeTestDeps({ cannedResponse: FIVE_MEALS, month: 6 });
    llm.shouldThrow = new Error("Connection refused");
    const app = createApp(deps);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await app.request("http://localhost/api/inspiration", {
      method: "POST",
    });

    expect(warnSpy).toHaveBeenCalled();
    const logMsg = warnSpy.mock.calls[0]?.join(" ") ?? "";
    expect(logMsg).toContain("mailtid");
    expect(logMsg).toContain("Connection refused");

    warnSpy.mockRestore();
  });
});

describe("Error handling: malformed LLM JSON", () => {
  test("malformed JSON is logged at WARN level", async () => {
    const { deps } = makeTestDeps({ cannedResponse: "not json at all", month: 6 });
    const app = createApp(deps);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const res = await app.request("http://localhost/api/inspiration", {
      method: "POST",
    });
    expect(res.status).toBe(502);

    expect(warnSpy).toHaveBeenCalled();
    const logMsg = warnSpy.mock.calls[0]?.join(" ") ?? "";
    expect(logMsg).toContain("mailtid");

    warnSpy.mockRestore();
  });

  test("malformed JSON returns friendly Danish error to user", async () => {
    const { deps } = makeTestDeps({ cannedResponse: "not json at all", month: 6 });
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/inspiration", {
      method: "POST",
    });
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Kunne ikke få forslag");
  });
});
