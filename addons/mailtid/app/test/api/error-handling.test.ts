import { describe, expect, test, vi } from "vitest";
import { createApp } from "../../src/server/app.js";
import { makeTestDeps } from "../helpers/deps.js";

function makeCannedMeal(title: string, description: string) {
  return {
    title,
    description,
    ingredients: [{ name: "X", amount: "1", unit: "stk" }],
    steps: ["Gør klar."],
    time_minutes: 10,
  };
}

const SIX_MEALS = JSON.stringify({
  meals: [
    makeCannedMeal("Test ret 1", "En beskrivelse."),
    makeCannedMeal("Test ret 2", "En anden beskrivelse."),
    makeCannedMeal("Test ret 3", "Tredje beskrivelse."),
    makeCannedMeal("Test ret 4", "Fjerde beskrivelse."),
    makeCannedMeal("Test ret 5", "Femte beskrivelse."),
    makeCannedMeal("Test ret 6", "Sjette beskrivelse."),
  ],
});

async function readSSE(res: Response): Promise<{ event: string; data: string }[]> {
  const text = await res.text();
  const events: { event: string; data: string }[] = [];
  let currentEvent = "message";
  for (const line of text.split("\n")) {
    if (line.startsWith("event: ")) {
      currentEvent = line.slice(7).trim();
    } else if (line.startsWith("data: ")) {
      events.push({ event: currentEvent, data: line.slice(6) });
      currentEvent = "message";
    }
  }
  return events;
}

describe("Error handling: missing API key", () => {
  test("GET / returns home page with missing-key message when api key is empty", async () => {
    const { deps } = makeTestDeps({ cannedResponse: SIX_MEALS, month: 6, hasApiKey: false });
    const app = createApp(deps);

    const res = await app.request("http://localhost/");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("OpenCode API-nøgle");
    expect(html).toContain("i indstillingerne");
  });

  test("GET / does not show missing-key message when api key is set", async () => {
    const { deps } = makeTestDeps({ cannedResponse: SIX_MEALS, month: 6, hasApiKey: true });
    const app = createApp(deps);

    const res = await app.request("http://localhost/");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).not.toContain("OpenCode API-nøgle");
  });

  test("POST /api/inspiration returns 503 when API key is missing", async () => {
    const { deps } = makeTestDeps({ cannedResponse: SIX_MEALS, month: 6, hasApiKey: false });
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
    const { deps, llm } = makeTestDeps({ cannedResponse: SIX_MEALS, month: 6 });
    llm.shouldThrow = new Error("Connection refused");
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/inspiration", {
      method: "POST",
    });
    expect(res.status).toBe(200); // SSE always returns 200
    const events = await readSSE(res);
    const errorEvent = events.find((e) => e.event === "error");
    expect(errorEvent).toBeDefined();
    const body = JSON.parse(errorEvent!.data) as { error: string };
    expect(body.error).toContain("Kunne ikke få forslag");
  });

  test("POST /api/inspiration/recipe returns error SSE event when the LLM call throws", async () => {
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
    expect(res.status).toBe(200); // SSE always returns 200
    const events = await readSSE(res);
    const errorEvent = events.find((e) => e.event === "error");
    expect(errorEvent).toBeDefined();
    const body = JSON.parse(errorEvent!.data) as { error: string };
    expect(body.error).toContain("Kunne ikke hente opskrift");
  });

  test("LLM throw is logged at ERROR level with full stack", async () => {
    // The HTTP response stays user-friendly (Danish error, 502);
    // the operator looking at `docker run -it` output gets the
    // full error name, message, and stack on stderr.
    const { deps, llm } = makeTestDeps({ cannedResponse: SIX_MEALS, month: 6 });
    llm.shouldThrow = new Error("Connection refused");
    const app = createApp(deps);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await app.request("http://localhost/api/inspiration", {
      method: "POST",
    });

    expect(errorSpy).toHaveBeenCalled();
    const allCalls = errorSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(allCalls).toContain("mailtid");
    expect(allCalls).toContain("inspiration");
    expect(allCalls).toContain("Connection refused");

    errorSpy.mockRestore();
  });
});

describe("Error handling: malformed LLM JSON", () => {
  test("malformed JSON is logged at ERROR level", async () => {
    const { deps } = makeTestDeps({ cannedResponse: "not json at all", month: 6 });
    const app = createApp(deps);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await app.request("http://localhost/api/inspiration", {
      method: "POST",
    });
    expect(res.status).toBe(200); // SSE always returns 200

    expect(errorSpy).toHaveBeenCalled();
    const allCalls = errorSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(allCalls).toContain("mailtid");

    errorSpy.mockRestore();
  });

  test("malformed JSON returns friendly Danish error to user", async () => {
    const { deps } = makeTestDeps({ cannedResponse: "not json at all", month: 6 });
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/inspiration", {
      method: "POST",
    });
    expect(res.status).toBe(200); // SSE always returns 200
    const events = await readSSE(res);
    const errorEvent = events.find((e) => e.event === "error");
    expect(errorEvent).toBeDefined();
    const body = JSON.parse(errorEvent!.data) as { error: string };
    expect(body.error).toContain("Kunne ikke få forslag");
  });
});
