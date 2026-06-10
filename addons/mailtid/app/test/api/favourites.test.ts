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

describe("POST /api/favourites", () => {
  test("adds a meal to favourites and returns 201", async () => {
    const { deps } = makeTestDeps({ cannedResponse: FIVE_MEALS, month: 6 });
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/favourites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Jordbærtærte",
        description: "Sprød tærte med friske jordbær.",
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      id: number;
      title: string;
      description: string;
      savedAt: number;
    };
    expect(body.id).toBeGreaterThan(0);
    expect(body.title).toBe("Jordbærtærte");
    expect(body.description).toBe("Sprød tærte med friske jordbær.");
    expect(body.savedAt).toBeGreaterThan(0);
  });

  test("rejects when body is missing title or description", async () => {
    const { deps } = makeTestDeps({ cannedResponse: FIVE_MEALS, month: 6 });
    const app = createApp(deps);

    const res1 = await app.request("http://localhost/api/favourites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Kun titel" }),
    });
    expect(res1.status).toBe(400);

    const res2 = await app.request("http://localhost/api/favourites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ description: "Kun beskrivelse" }),
    });
    expect(res2.status).toBe(400);
  });
});

describe("GET /api/favourites", () => {
  test("returns saved favourites, newest first", async () => {
    const { deps } = makeTestDeps({ cannedResponse: FIVE_MEALS, month: 6 });
    const app = createApp(deps);

    // Add two favourites.
    await app.request("http://localhost/api/favourites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Første",
        description: "Første ret.",
      }),
    });
    await app.request("http://localhost/api/favourites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Anden",
        description: "Anden ret.",
      }),
    });

    const res = await app.request("http://localhost/api/favourites");
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      favourites: { id: number; title: string; description: string; savedAt: number }[];
    };
    expect(body.favourites).toHaveLength(2);
    // Newest first.
    expect(body.favourites[0]?.title).toBe("Anden");
    expect(body.favourites[1]?.title).toBe("Første");
  });

  test("returns empty array when no favourites", async () => {
    const { deps } = makeTestDeps({ cannedResponse: FIVE_MEALS, month: 6 });
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/favourites");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { favourites: unknown[] };
    expect(body.favourites).toEqual([]);
  });
});

describe("POST /api/cooked", () => {
  test("stamps a meal as cooked and returns 201", async () => {
    const { deps } = makeTestDeps({ cannedResponse: FIVE_MEALS, month: 6 });
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/cooked", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Jordbærtærte",
        description: "Sprød tærte med friske jordbær.",
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      id: number;
      title: string;
      description: string;
      cookedAt: number;
    };
    expect(body.id).toBeGreaterThan(0);
    expect(body.title).toBe("Jordbærtærte");
    expect(body.cookedAt).toBeGreaterThan(0);
  });

  test("rejects when body is missing title or description", async () => {
    const { deps } = makeTestDeps({ cannedResponse: FIVE_MEALS, month: 6 });
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/cooked", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Kun titel" }),
    });
    expect(res.status).toBe(400);
  });
});
