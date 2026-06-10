import { describe, expect, test } from "vitest";
import { createApp } from "../../src/server/app.js";
import { makeTestDeps } from "../helpers/deps.js";
import { SeasonalityRepository } from "../../src/db/seasonality.js";

const CANNED = JSON.stringify({ meals: [] });

describe("GET /api/admin/seasonality", () => {
  test("returns all ingredients grouped by slug with months", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/admin/seasonality");
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      ingredients: { slug: string; nameDa: string; months: number[] }[];
    };
    expect(body.ingredients.length).toBeGreaterThan(50);
    // Spot-check: Jordbær has months [5, 6, 7].
    const jordbaer = body.ingredients.find((i) => i.slug === "jordbaer");
    expect(jordbaer).toBeDefined();
    expect(jordbaer!.nameDa).toBe("Jordbær");
    expect(jordbaer!.months).toEqual([5, 6, 7]);
  });
});

describe("PUT /api/admin/seasonality/:slug", () => {
  test("updates an existing ingredient's name and months", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    const app = createApp(deps);

    const res = await app.request(
      "http://localhost/api/admin/seasonality/jordbaer",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nameDa: "Jordbær (ny)", months: [5, 6] }),
      },
    );
    expect(res.status).toBe(200);

    const body = (await res.json()) as { slug: string; nameDa: string; months: number[] };
    expect(body.slug).toBe("jordbaer");
    expect(body.nameDa).toBe("Jordbær (ny)");
    expect(body.months).toEqual([5, 6]);

    // Verify the change is persisted in the DB.
    const all = deps.seasonality.findAll();
    const updated = all.find((i) => i.slug === "jordbaer");
    expect(updated).toBeDefined();
    expect(updated!.nameDa).toBe("Jordbær (ny)");
    expect(updated!.months).toEqual([5, 6]);
  });

  test("inserts a new ingredient when the slug does not exist", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    const app = createApp(deps);

    const res = await app.request(
      "http://localhost/api/admin/seasonality/ingefaerd",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nameDa: "Ingefærd", months: [1, 2, 3] }),
      },
    );
    expect(res.status).toBe(200);

    const body = (await res.json()) as { slug: string; nameDa: string; months: number[] };
    expect(body.slug).toBe("ingefaerd");
    expect(body.nameDa).toBe("Ingefærd");

    const all = deps.seasonality.findAll();
    const created = all.find((i) => i.slug === "ingefaerd");
    expect(created).toBeDefined();
    expect(created!.months).toEqual([1, 2, 3]);
  });

  test("rejects invalid months (not an array of 1-12 integers)", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    const app = createApp(deps);

    const res = await app.request(
      "http://localhost/api/admin/seasonality/jordbaer",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nameDa: "Jordbær", months: [0] }),
      },
    );
    expect(res.status).toBe(400);
  });

  test("rejects when nameDa is missing or not a string", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    const app = createApp(deps);

    const res = await app.request(
      "http://localhost/api/admin/seasonality/jordbaer",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ months: [5, 6] }),
      },
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/admin/seasonality", () => {
  test("creates a new ingredient with slug derived from nameDa", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/admin/seasonality", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nameDa: "Ingefærd", months: [4, 5] }),
    });
    expect(res.status).toBe(201);

    const body = (await res.json()) as { slug: string; nameDa: string; months: number[] };
    expect(body.nameDa).toBe("Ingefærd");
    // Slug should be derived: lowercase, ASCII-normalized.
    expect(body.slug).toMatch(/^[a-z_]+$/);
    expect(body.months).toEqual([4, 5]);

    // Verify in DB.
    const all = deps.seasonality.findAll();
    const created = all.find((i) => i.slug === body.slug);
    expect(created).toBeDefined();
    expect(created!.nameDa).toBe("Ingefærd");
  });

  test("rejects when nameDa is missing or not a non-empty string", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/admin/seasonality", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ months: [1] }),
    });
    expect(res.status).toBe(400);
  });

  test("rejects when months is missing or not an array", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/admin/seasonality", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nameDa: "Test" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/admin/seasonality/:slug", () => {
  test("removes all rows for the given slug", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    const app = createApp(deps);

    // Jordbær exists in the seed.
    const before = deps.seasonality.findAll();
    expect(before.find((i) => i.slug === "jordbaer")).toBeDefined();

    const res = await app.request(
      "http://localhost/api/admin/seasonality/jordbaer",
      { method: "DELETE" },
    );
    expect(res.status).toBe(204);

    const after = deps.seasonality.findAll();
    expect(after.find((i) => i.slug === "jordbaer")).toBeUndefined();
  });

  test("returns 204 even when the slug does not exist (idempotent)", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    const app = createApp(deps);

    const res = await app.request(
      "http://localhost/api/admin/seasonality/findes_ikke",
      { method: "DELETE" },
    );
    expect(res.status).toBe(204);
  });
});

describe("POST /api/admin/seasonality/reset", () => {
  test("wipes all rows and re-imports the seed JSON", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    const app = createApp(deps);

    // First, make an edit.
    deps.seasonality.upsert("jordbaer", "Ændret", [1]);
    expect(deps.seasonality.findAll().find((i) => i.slug === "jordbaer")!.nameDa).toBe("Ændret");

    // Reset.
    const res = await app.request(
      "http://localhost/api/admin/seasonality/reset",
      { method: "POST" },
    );
    expect(res.status).toBe(200);

    const body = (await res.json()) as { ok: boolean; count: number };
    expect(body.ok).toBe(true);

    // After reset, Jordbær should be back to the seed value.
    const all = deps.seasonality.findAll();
    const jordbaer = all.find((i) => i.slug === "jordbaer");
    expect(jordbaer).toBeDefined();
    expect(jordbaer!.nameDa).toBe("Jordbær");
    expect(jordbaer!.months).toEqual([5, 6, 7]);
  });
});

describe("DB-wins semantics", () => {
  test("edits survive across repository re-instantiation (simulated restart)", () => {
    const { deps, db } = makeTestDeps({ cannedResponse: CANNED, month: 6 });

    // Make an edit through the repository.
    deps.seasonality.upsert("jordbaer", "Jordbær (redigeret)", [4, 5, 6]);

    // Simulate a restart: create a new repository on the same DB.
    const fresh = new SeasonalityRepository(db);

    const jordbaer = fresh.findAll().find((i) => i.slug === "jordbaer");
    expect(jordbaer).toBeDefined();
    expect(jordbaer!.nameDa).toBe("Jordbær (redigeret)");
    expect(jordbaer!.months).toEqual([4, 5, 6]);
  });

  test("edits survive a reset-to-seed then re-edit (full lifecycle)", () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });

    // Edit.
    deps.seasonality.upsert("jordbaer", "Redigeret", [1]);
    expect(deps.seasonality.findAll().find((i) => i.slug === "jordbaer")!.nameDa).toBe("Redigeret");

    // Reset.
    deps.seasonality.resetSeed();
    expect(deps.seasonality.findAll().find((i) => i.slug === "jordbaer")!.nameDa).toBe("Jordbær");

    // Re-edit.
    deps.seasonality.upsert("jordbaer", "Redigeret igen", [2]);
    expect(deps.seasonality.findAll().find((i) => i.slug === "jordbaer")!.nameDa).toBe("Redigeret igen");
  });
});
