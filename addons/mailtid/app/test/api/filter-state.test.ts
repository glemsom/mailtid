import { describe, expect, test } from "vitest";
import { createApp } from "../../src/server/app.js";
import { makeTestDeps } from "../helpers/deps.js";

const CANNED = JSON.stringify({ meals: [] });

describe("GET /api/filter", () => {
  test("returns an empty filter state when nothing has been saved", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/filter");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ includes: [], excludes: [] });
  });

  test("returns the saved filter state", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    const app = createApp(deps);
    await app.request("http://localhost/api/filter", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        includes: ["asparges"],
        excludes: ["champignon"],
      }),
    });

    const res = await app.request("http://localhost/api/filter");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      includes: ["asparges"],
      excludes: ["champignon"],
    });
  });
});

describe("PUT /api/filter", () => {
  test("saves a new filter state and returns it", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/filter", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        includes: ["asparges", "jordbaer"],
        excludes: ["champignon"],
      }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      includes: ["asparges", "jordbaer"],
      excludes: ["champignon"],
    });
  });

  test("replaces the previous state instead of merging", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    const app = createApp(deps);
    await app.request("http://localhost/api/filter", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ includes: ["asparges"], excludes: [] }),
    });

    await app.request("http://localhost/api/filter", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ includes: [], excludes: ["champignon"] }),
    });

    const res = await app.request("http://localhost/api/filter");
    expect(await res.json()).toEqual({
      includes: [],
      excludes: ["champignon"],
    });
  });

  test("returns 400 when the body is missing includes or excludes", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/filter", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ includes: ["asparges"] }),
    });

    expect(res.status).toBe(400);
  });

  test("returns 400 when a slug is not a string", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/filter", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ includes: [42], excludes: [] }),
    });

    expect(res.status).toBe(400);
  });

  test("returns 400 when the body is not JSON", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/filter", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "not json",
    });

    expect(res.status).toBe(400);
  });
});
