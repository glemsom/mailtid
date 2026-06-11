import { describe, expect, test } from "vitest";
import { createApp } from "../../src/server/app.js";
import { makeTestDeps } from "../helpers/deps.js";

function makeCannedMeal(title: string, description: string) {
  return {
    title,
    description,
    ingredients: [
      { name: "Hovedingrediens", amount: "500", unit: "g" },
      { name: "Salt", amount: "1", unit: "tsk" },
    ],
    steps: [
      "Forbered ingredienserne.",
      "Tilbered retten.",
      "Server og nyd.",
    ],
    time_minutes: 30,
  };
}

const SIX_MEALS = JSON.stringify({
  meals: [
    makeCannedMeal("Jordbærtærte", "Sprød tærte med friske jordbær."),
    makeCannedMeal("Aspargessuppe", "Cremet suppe med grønne asparges."),
    makeCannedMeal("Kartoffelsalat", "Klassisk kartoffelsalat med dild."),
    makeCannedMeal("Tomatsalat", "Frisk salat med modne tomater."),
    makeCannedMeal("Rabarberkompot", "Sød kompot af årets rabarber."),
    makeCannedMeal("Blomkålssuppe", "Fløjlsblød suppe med blomkål."),
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

describe("POST /api/inspiration", () => {
  test("returns 6 short-form Meal Inspirations as JSON", async () => {
    const { deps } = makeTestDeps({ cannedResponse: SIX_MEALS, month: 6 });
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/inspiration", {
      method: "POST",
    });

    expect(res.status).toBe(200);
    const events = await readSSE(res);
    const doneEvent = events.find((e) => e.event === "done");
    expect(doneEvent).toBeDefined();
    const body = JSON.parse(doneEvent!.data) as {
      meals: { title: string; description: string }[];
    };
    expect(body.meals).toHaveLength(6);
    expect(body.meals[0]?.title).toBe("Jordbærtærte");
    expect(body.meals[0]?.description).toMatch(/jordbær/);
    expect(body.meals[0]?.ingredients).toHaveLength(2);
    expect(body.meals[0]?.timeMinutes).toBe(30);
  });

  test("hands the LLM a prompt that names the current month", async () => {
    const { deps, llm } = makeTestDeps({ cannedResponse: SIX_MEALS, month: 6 });
    const app = createApp(deps);

    await app.request("http://localhost/api/inspiration", { method: "POST" });

    expect(llm.prompts).toHaveLength(1);
    expect(llm.prompts[0]).toContain("Juni");
    expect(llm.prompts[0]).toContain("måned 6");
  });

  test("returns 502 when the LLM response is malformed", async () => {
    const { deps } = makeTestDeps({ cannedResponse: "not json", month: 6 });
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

  test("applies the user's saved in-season filter to the LLM prompt", async () => {
    const { deps, llm } = makeTestDeps({ cannedResponse: SIX_MEALS, month: 6 });
    const app = createApp(deps);

    // Set a filter: include asparges, exclude champignon.
    await app.request("http://localhost/api/filter", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        includes: ["asparges"],
        excludes: ["champignon"],
      }),
    });
    // Clear any leftover prompts.
    llm.prompts.length = 0;

    await app.request("http://localhost/api/inspiration", { method: "POST" });

    const prompt = llm.prompts[0] ?? "";
    expect(prompt).toContain("Filtreringskrav");
    expect(prompt).toContain("Asparges");
    expect(prompt).toContain("Champignon");
  });

  test("applies the user's saved custom mandatory ingredients to the LLM prompt", async () => {
    const { deps, llm } = makeTestDeps({ cannedResponse: SIX_MEALS, month: 6 });
    const app = createApp(deps);

    await app.request("http://localhost/api/custom-ingredients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Ris" }),
    });
    llm.prompts.length = 0;

    await app.request("http://localhost/api/inspiration", { method: "POST" });

    const prompt = llm.prompts[0] ?? "";
    expect(prompt).toContain("Filtreringskrav");
    expect(prompt).toContain("Ris");
  });

  test("includes the user profile in the prompt when set", async () => {
    const { deps, llm } = makeTestDeps({ cannedResponse: SIX_MEALS, month: 6 });
    deps.profile.save({
      dietaryPattern: "vegetarian",
      allergies: ["Mælk"],
      dislikes: "svampe",
    });
    const app = createApp(deps);

    await app.request("http://localhost/api/inspiration", { method: "POST" });

    const prompt = llm.prompts[0] ?? "";
    expect(prompt).toContain("Kostprofil");
    expect(prompt).toContain("vegetarian");
    expect(prompt).toContain("Mælk");
    expect(prompt).toContain("svampe");
  });

  test("no profile section when profile is empty", async () => {
    const { deps, llm } = makeTestDeps({ cannedResponse: SIX_MEALS, month: 6 });
    const app = createApp(deps);

    await app.request("http://localhost/api/inspiration", { method: "POST" });

    const prompt = llm.prompts[0] ?? "";
    expect(prompt).not.toContain("Kostprofil");
  });

  test("emits thinking SSE events when the LLM produces reasoning tokens", async () => {
    const { deps, llm } = makeTestDeps({ cannedResponse: SIX_MEALS, month: 6 });
    llm.cannedReasoning = "Lad mig tænke...";
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/inspiration", {
      method: "POST",
    });

    const events = await readSSE(res);
    const thinkingEvent = events.find((e) => e.event === "thinking");
    expect(thinkingEvent).toBeDefined();
    expect(thinkingEvent!.data).toBe("Lad mig tænke...");
  });

  test("does not emit thinking SSE events when the model produces no reasoning", async () => {
    const { deps } = makeTestDeps({ cannedResponse: SIX_MEALS, month: 6 });
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/inspiration", {
      method: "POST",
    });

    const events = await readSSE(res);
    const thinkingEvents = events.filter((e) => e.event === "thinking");
    expect(thinkingEvents).toHaveLength(0);
  });

  test("status and done events still work alongside thinking events", async () => {
    const { deps, llm } = makeTestDeps({ cannedResponse: SIX_MEALS, month: 6 });
    llm.cannedReasoning = "ræsonnerer...";
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/inspiration", {
      method: "POST",
    });

    const events = await readSSE(res);
    const statusEvents = events.filter((e) => e.event === "status");
    const doneEvent = events.find((e) => e.event === "done");
    const thinkingEvents = events.filter((e) => e.event === "thinking");

    expect(statusEvents.length).toBeGreaterThan(0);
    expect(doneEvent).toBeDefined();
    expect(thinkingEvents.length).toBeGreaterThan(0);
  });
});
