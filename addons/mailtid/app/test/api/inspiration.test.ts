import { describe, expect, test } from "vitest";
import { createApp } from "../../src/server/app.js";
import { makeTestDeps } from "../helpers/deps.js";

const FIVE_MEALS = JSON.stringify({
  meals: [
    { title: "Jordbærtærte", description: "Sprød tærte med friske jordbær." },
    { title: "Aspargessuppe", description: "Cremet suppe med grønne asparges." },
    { title: "Kartoffelsalat", description: "Klassisk kartoffelsalat med dild." },
    { title: "Tomatsalat", description: "Frisk salat med modne tomater." },
    { title: "Rabarberkompot", description: "Sød kompot af årets rabarber." },
  ],
});

describe("POST /api/inspiration", () => {
  test("returns 5 short-form Meal Inspirations as JSON", async () => {
    const { deps } = makeTestDeps({ cannedResponse: FIVE_MEALS, month: 6 });
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/inspiration", {
      method: "POST",
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      meals: { title: string; description: string }[];
    };
    expect(body.meals).toHaveLength(5);
    expect(body.meals[0]?.title).toBe("Jordbærtærte");
    expect(body.meals[0]?.description).toMatch(/jordbær/);
  });

  test("hands the LLM a prompt that names the current month", async () => {
    const { deps, llm } = makeTestDeps({ cannedResponse: FIVE_MEALS, month: 6 });
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

    expect(res.status).toBe(502);
  });

  test("applies the user's saved in-season filter to the LLM prompt", async () => {
    const { deps, llm } = makeTestDeps({ cannedResponse: FIVE_MEALS, month: 6 });
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
    const { deps, llm } = makeTestDeps({ cannedResponse: FIVE_MEALS, month: 6 });
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
});
