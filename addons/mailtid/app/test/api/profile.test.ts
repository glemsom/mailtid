import { describe, expect, test } from "vitest";
import { createApp } from "../../src/server/app.js";
import { makeTestDeps } from "../helpers/deps.js";

const CANNED = JSON.stringify({ meals: [] });

describe("GET /api/profile", () => {
  test("returns null when the profile has not been set", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/profile");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ profile: null });
  });

  test("returns the saved profile", async () => {
    const { deps, db } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    // Save a profile directly through the repo.
    deps.profile.save({
      dietaryPattern: "vegetarian",
      allergies: ["Mælk", "Nødder"],
      dislikes: "svampe",
    });
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/profile");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      profile: { dietaryPattern: string; allergies: string[]; dislikes: string } | null;
    };
    expect(body.profile).not.toBeNull();
    expect(body.profile!.dietaryPattern).toBe("vegetarian");
    expect(body.profile!.allergies).toEqual(["Mælk", "Nødder"]);
    expect(body.profile!.dislikes).toBe("svampe");
  });
});

describe("PUT /api/profile", () => {
  test("saves a valid profile and returns it", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dietaryPattern: "vegan",
        allergies: ["Soja"],
        dislikes: "koriander",
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      profile: { dietaryPattern: string; allergies: string[]; dislikes: string };
    };
    expect(body.profile.dietaryPattern).toBe("vegan");
    expect(body.profile.allergies).toEqual(["Soja"]);
    expect(body.profile.dislikes).toBe("koriander");

    // Verify persisted in the DB.
    const found = deps.profile.find();
    expect(found?.dietaryPattern).toBe("vegan");
  });

  test("rejects an invalid dietary pattern with 400", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dietaryPattern: "carnivore",
        allergies: [],
        dislikes: "",
      }),
    });

    expect(res.status).toBe(400);
  });

  test("rejects missing body fields with 400", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dietaryPattern: "omnivore" }),
    });

    expect(res.status).toBe(400);
  });

  test("rejects non-array allergies with 400", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dietaryPattern: "omnivore",
        allergies: "Mælk",
        dislikes: "",
      }),
    });

    expect(res.status).toBe(400);
  });
});
