import { describe, expect, test } from "vitest";
import { createApp } from "../../src/server/app.js";
import { makeTestDeps } from "../helpers/deps.js";

const CANNED = JSON.stringify({ meals: [] });

describe("GET /", () => {
  test("returns the Mailtid greeting with HTTP 200", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    const app = createApp(deps);

    const res = await app.request("http://localhost/");

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("Mailtid");
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
