import { describe, expect, test } from "vitest";
import { createApp } from "../../src/server/app.js";
import { makeTestDeps } from "../helpers/deps.js";

const CANNED = JSON.stringify({ meals: [] });

async function settingsHtml(): Promise<string> {
  const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
  const app = createApp(deps);
  const res = await app.request("http://localhost/indstillinger");
  expect(res.status).toBe(200);
  return res.text();
}

describe("GET /indstillinger (settings page)", () => {
  test("renders server-rendered HTML with Danish title", async () => {
    const html = await settingsHtml();

    expect(html.toLowerCase()).toContain("<!doctype html>");
    expect(html).toContain("Indstillinger");
    expect(html).toContain("Mailtid");
  });

  test("renders dietary pattern options", async () => {
    const html = await settingsHtml();

    expect(html).toContain("Altspisende");
    expect(html).toContain("Vegansk");
    expect(html).toContain("Vegetarisk");
  });

  test("renders allergy checkboxes", async () => {
    const html = await settingsHtml();

    expect(html).toContain("Mælk");
    expect(html).toContain("Gluten");
    expect(html).toContain("Nødder");
  });

  test("shows model picker with 'Opdater modeller' button", async () => {
    const html = await settingsHtml();

    expect(html).toContain("Opdater modeller");
    expect(html).toContain("model-picker");
    expect(html).toContain("Ingen modeller hentet endnu");
  });

  test("shows cached models in the picker when available", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    deps.settings.replaceModelCache([
      { modelId: "opencode-go/glm-5.1", displayName: "GLM 5.1", tier: "free" as const },
    ]);
    const app = createApp(deps);
    const res = await app.request("http://localhost/indstillinger");
    const html = await res.text();

    expect(html).toContain("GLM 5.1");
    expect(html).toContain("1 modeller tilgængelige");
    expect(html).not.toContain("Ingen modeller hentet endnu");
  });

  test("pre-selects the saved dietary pattern when a profile exists", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    deps.profile.save({
      dietaryPattern: "vegetarian",
      allergies: [],
      dislikes: "",
    });
    const app = createApp(deps);
    const res = await app.request("http://localhost/indstillinger");
    const html = await res.text();

    // The select should have the "selected" attribute on the vegetarian option.
    expect(html).toMatch(/<option value="vegetarian"[^>]*selected/);
  });

  test("pre-fills the dislikes textarea when a profile exists", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    deps.profile.save({
      dietaryPattern: "omnivore",
      allergies: [],
      dislikes: "svampe, koriander",
    });
    const app = createApp(deps);
    const res = await app.request("http://localhost/indstillinger");
    const html = await res.text();

    expect(html).toContain("svampe, koriander");
  });

  test("pre-selects the active model", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    deps.settings.replaceModelCache([
      { modelId: "opencode-go/a", displayName: "Model A", tier: "free" as const },
      { modelId: "opencode-go/b", displayName: "Model B", tier: "paid" as const },
    ]);
    deps.settings.setActiveModel("opencode-go/b");
    const app = createApp(deps);
    const res = await app.request("http://localhost/indstillinger");
    const html = await res.text();

    expect(html).toMatch(/<option value="opencode-go\/b"[^>]*selected/);
  });

  test("warns when active model is no longer in the cached list", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    deps.settings.replaceModelCache([
      { modelId: "opencode-go/a", displayName: "Model A", tier: "free" as const },
    ]);
    // Active model is set to something not in the cache.
    deps.settings.setActiveModel("opencode-go/removed-model");
    const app = createApp(deps);
    const res = await app.request("http://localhost/indstillinger");
    const html = await res.text();

    expect(html).toContain("ikke længere tilgængelig");
    expect(html).toContain("opencode-go/removed-model");
  });
});
