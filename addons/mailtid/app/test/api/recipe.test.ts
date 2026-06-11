import { describe, expect, test } from "vitest";
import { createApp } from "../../src/server/app.js";
import { makeTestDeps } from "../helpers/deps.js";

const CANNED_RECIPE = JSON.stringify({
  title: "Cremet aspargessuppe",
  description: "En cremet suppe med friske grønne asparges.",
  ingredients: [
    { name: "Grønne asparges", amount: "500", unit: "g" },
    { name: "Løg", amount: "1", unit: "stk" },
    { name: "Fløde", amount: "2", unit: "dl" },
  ],
  steps: [
    "Skær asparges i stykker og svits dem med løg i en gryde.",
    "Tilsæt bouillon og lad simre i 15 minutter.",
  ],
  time_minutes: 30,
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

describe("POST /api/inspiration/recipe", () => {
  test("streams a full recipe via SSE for a valid short-form meal", async () => {
    const { deps } = makeTestDeps({
      cannedResponse: CANNED_RECIPE,
      month: 6,
    });
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/inspiration/recipe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Aspargessuppe",
        description: "Cremet suppe med grønne asparges.",
      }),
    });

    expect(res.status).toBe(200);
    const events = await readSSE(res);
    const doneEvent = events.find((e) => e.event === "done");
    expect(doneEvent).toBeDefined();
    const body = JSON.parse(doneEvent!.data) as {
      title: string;
      description: string;
      ingredients: { name: string; amount: string; unit: string }[];
      steps: string[];
      timeMinutes: number;
    };
    expect(body.title).toBe("Cremet aspargessuppe");
    expect(body.ingredients).toHaveLength(3);
    expect(body.ingredients[0]?.name).toBe("Grønne asparges");
    expect(body.steps).toHaveLength(2);
    expect(body.timeMinutes).toBe(30);
  });

  test("returns 400 when the request body is missing title or description", async () => {
    const { deps } = makeTestDeps({
      cannedResponse: CANNED_RECIPE,
      month: 6,
    });
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/inspiration/recipe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Aspargessuppe" }),
    });

    expect(res.status).toBe(400);
  });

  test("returns 400 when the request body is not JSON", async () => {
    const { deps } = makeTestDeps({
      cannedResponse: CANNED_RECIPE,
      month: 6,
    });
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/inspiration/recipe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });

    expect(res.status).toBe(400);
  });

  test("emits error SSE event when the LLM response is malformed", async () => {
    const { deps } = makeTestDeps({
      cannedResponse: "not json at all",
      month: 6,
    });
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/inspiration/recipe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Aspargessuppe",
        description: "Cremet suppe med grønne asparges.",
      }),
    });

    expect(res.status).toBe(200); // SSE always returns 200
    const events = await readSSE(res);
    const errorEvent = events.find((e) => e.event === "error");
    expect(errorEvent).toBeDefined();
    const body = JSON.parse(errorEvent!.data) as { error: string };
    expect(body.error).toContain("Kunne ikke hente opskrift");
  });

  test("uses the user's saved active model when calling the LLM", async () => {
    // Regression for the "Se opskrift" 502: the recipe call used
    // to ignore the user's selected model and fall back to a
    // hardcoded default that the upstream 404s on. The fix threads
    // the active model through SettingsRepository.
    const { deps, llm } = makeTestDeps({
      cannedResponse: CANNED_RECIPE,
      month: 6,
    });
    deps.settings.setActiveModel("opencode-go/deepseek-v4-flash");
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/inspiration/recipe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Aspargessuppe",
        description: "Cremet suppe med grønne asparges.",
      }),
    });

    expect(res.status).toBe(200);
    expect(llm.models).toEqual(["opencode-go/deepseek-v4-flash"]);
  });

  test("emits status SSE events", async () => {
    const { deps } = makeTestDeps({
      cannedResponse: CANNED_RECIPE,
      month: 6,
    });
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/inspiration/recipe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Aspargessuppe",
        description: "Cremet suppe med grønne asparges.",
      }),
    });

    expect(res.status).toBe(200);
    const events = await readSSE(res);
    const statusEvents = events.filter((e) => e.event === "status");
    expect(statusEvents.length).toBeGreaterThan(0);
  });

  test("emits thinking SSE events when the LLM produces reasoning tokens", async () => {
    const { deps, llm } = makeTestDeps({
      cannedResponse: CANNED_RECIPE,
      month: 6,
    });
    llm.cannedReasoning = "Lad mig tænke over opskriften...";
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/inspiration/recipe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Aspargessuppe",
        description: "Cremet suppe med grønne asparges.",
      }),
    });

    expect(res.status).toBe(200);
    const events = await readSSE(res);
    const thinkingEvent = events.find((e) => e.event === "thinking");
    expect(thinkingEvent).toBeDefined();
    expect(thinkingEvent!.data).toBe("Lad mig tænke over opskriften...");
  });
});
