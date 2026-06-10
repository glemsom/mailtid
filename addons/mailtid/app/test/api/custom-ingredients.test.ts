import { describe, expect, test } from "vitest";
import { createApp } from "../../src/server/app.js";
import { makeTestDeps } from "../helpers/deps.js";

const CANNED = JSON.stringify({ meals: [] });

describe("GET /api/custom-ingredients", () => {
  test("returns an empty items list when nothing has been added", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/custom-ingredients");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [] });
  });

  test("returns previously added custom mandatory ingredients", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    const app = createApp(deps);

    await app.request("http://localhost/api/custom-ingredients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Ris" }),
    });
    await app.request("http://localhost/api/custom-ingredients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Løg" }),
    });

    const res = await app.request("http://localhost/api/custom-ingredients");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      items: [
        { slug: "ris", nameDa: "Ris" },
        { slug: "løg", nameDa: "Løg" },
      ],
    });
  });
});

describe("POST /api/custom-ingredients", () => {
  test("adds a custom mandatory ingredient and returns the stored shape", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/custom-ingredients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Ris" }),
    });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ slug: "ris", nameDa: "Ris" });
  });

  test("is idempotent on a second add of the same name", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    const app = createApp(deps);

    await app.request("http://localhost/api/custom-ingredients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Ris" }),
    });
    const res = await app.request("http://localhost/api/custom-ingredients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "ris" }),
    });

    expect(res.status).toBe(201);
    const list = await app.request("http://localhost/api/custom-ingredients");
    const body = (await list.json()) as { items: unknown[] };
    expect(body.items).toHaveLength(1);
  });

  test("returns 400 when the body is missing a name", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/custom-ingredients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });

  test("returns 400 when the body is not JSON", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/custom-ingredients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });

    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/custom-ingredients/:slug", () => {
  test("removes a previously added custom mandatory ingredient", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    const app = createApp(deps);
    await app.request("http://localhost/api/custom-ingredients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Ris" }),
    });

    const res = await app.request(
      "http://localhost/api/custom-ingredients/ris",
      { method: "DELETE" },
    );
    expect(res.status).toBe(204);

    const list = await app.request("http://localhost/api/custom-ingredients");
    expect((await list.json()) as { items: unknown[] }).toEqual({ items: [] });
  });

  test("returns 204 even when the slug is not present (idempotent)", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    const app = createApp(deps);

    const res = await app.request(
      "http://localhost/api/custom-ingredients/ris",
      { method: "DELETE" },
    );
    expect(res.status).toBe(204);
  });
});
