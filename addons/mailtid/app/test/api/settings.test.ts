import { describe, expect, test } from "vitest";
import { createApp } from "../../src/server/app.js";
import { makeTestDeps } from "../helpers/deps.js";

const CANNED = JSON.stringify({ meals: [] });

describe("GET /api/models", () => {
  test("returns an empty list when the cache has not been populated", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/models");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { models: unknown[] };
    expect(body.models).toEqual([]);
  });

  test("returns cached models grouped free first, then paid", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    deps.settings.replaceModelCache([
      { modelId: "opencode-go/paid-1", displayName: "Paid One", tier: "paid" as const },
      { modelId: "opencode-go/free-1", displayName: "Free One", tier: "free" as const },
    ]);
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/models");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      models: { modelId: string; displayName: string; tier: string }[];
    };
    expect(body.models).toHaveLength(2);
    expect(body.models[0]!.tier).toBe("free");
    expect(body.models[1]!.tier).toBe("paid");
  });
});

describe("PUT /api/settings", () => {
  test("persists the active model and returns ok", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    // Pre-populate the model cache so the model id is valid in context.
    deps.settings.replaceModelCache([
      { modelId: "opencode-go/glm-5.1", displayName: "GLM 5.1", tier: "free" as const },
    ]);
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ activeModel: "opencode-go/glm-5.1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    // Verify persisted.
    expect(deps.settings.getActiveModel()).toBe("opencode-go/glm-5.1");
  });

  test("rejects missing activeModel field with 400", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });
});

describe("POST /api/models/refresh", () => {
  // The real model fetch is tested separately (see prompt test);
  // here we only verify the endpoint shape. The endpoint delegates
  // to a refresh function; in tests it's a no-op stub.
  test("returns 200 with a status message", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    const app = createApp(deps);

    const res = await app.request("http://localhost/api/models/refresh", {
      method: "POST",
    });

    // Without a real API key, refresh should still return 200
    // (the error is logged, not returned to the user).
    expect(res.status).toBe(200);
  });
});
