import { describe, expect, test } from "vitest";
import { createApp } from "../../src/server/app.js";
import { makeTestDeps } from "../helpers/deps.js";

const CANNED = JSON.stringify({ meals: [] });

describe("GET /", () => {
  test("returns the home page with HTTP 200 and a Mailtid title", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    const app = createApp(deps);

    const res = await app.request("http://localhost/");

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Mailtid");
    expect(body.toLowerCase()).toContain("<!doctype html>");
  });
});

describe("unknown routes", () => {
  test("return HTTP 404", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    const app = createApp(deps);

    const res = await app.request("http://localhost/does-not-exist");

    expect(res.status).toBe(404);
  });
});
