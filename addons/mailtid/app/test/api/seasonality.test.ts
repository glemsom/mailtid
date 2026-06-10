import { describe, expect, test } from "vitest";
import { createApp } from "../../src/server/app.js";
import { makeTestDeps } from "../helpers/deps.js";

const CANNED = JSON.stringify({ meals: [] });

describe("GET /api/seasonality", () => {
  test("returns the in-season ingredients for a given month", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/seasonality?month=6");
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      month: number;
      ingredients: { slug: string; nameDa: string; month: number }[];
    };
    expect(body.month).toBe(6);
    expect(body.ingredients.length).toBeGreaterThan(0);
    // Spot-check: Jordbær is in season in June per the seed.
    const jordbaer = body.ingredients.find((i) => i.slug === "jordbaer");
    expect(jordbaer).toBeDefined();
    expect(jordbaer?.nameDa).toBe("Jordbær");
  });

  test("returns 400 for a non-integer month", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/seasonality?month=foo");
    expect(res.status).toBe(400);
  });

  test("returns 400 for an out-of-range month", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/seasonality?month=13");
    expect(res.status).toBe(400);
  });

  test("returns 400 when month is missing", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/seasonality");
    expect(res.status).toBe(400);
  });
});
