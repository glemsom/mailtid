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

describe("POST /api/inspiration/recipe", () => {
  test("returns a full recipe for a valid short-form meal", async () => {
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
    const body = (await res.json()) as {
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

  test("returns 502 when the LLM response is malformed", async () => {
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

    expect(res.status).toBe(502);
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
});
