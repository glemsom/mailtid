import { describe, expect, test } from "vitest";
import { createApp } from "../../src/server/app.js";
import { makeTestDeps } from "../helpers/deps.js";

const CANNED = JSON.stringify({ meals: [] });

async function homeHtml(month: number = 6): Promise<string> {
  const { deps } = makeTestDeps({ cannedResponse: CANNED, month });
  const app = createApp(deps);
  const res = await app.request("http://localhost/");
  expect(res.status).toBe(200);
  return res.text();
}

describe("GET / (home page)", () => {
  test("renders server-rendered HTML with a Danish Mailtid title", async () => {
    const html = await homeHtml();

    expect(html.toLowerCase()).toContain("<!doctype html>");
    expect(html).toContain("Mailtid");
    expect(html).toContain("dansk");
  });

  test("renders an in-season chip for every ingredient in the current month", async () => {
    const html = await homeHtml(6);

    // Jordbær is in season in June per the seed.
    expect(html).toContain("Jordbær");
    // Asparges is in season in April-June.
    expect(html).toContain("Asparges");
    // The chip element should be a button with a data-slug attribute.
    expect(html).toMatch(/data-slug="jordbaer"/);
    expect(html).toMatch(/data-slug="asparges"/);
  });

  test("renders a custom mandatory ingredients input", async () => {
    const html = await homeHtml();

    // The form lets the user add a custom mandatory ingredient.
    expect(html.toLowerCase()).toContain("name=\"name\"");
  });

  test("renders a 'Vis 6 nye' button that re-runs the inspiration call", async () => {
    const html = await homeHtml();

    expect(html).toContain("Vis 6 nye");
    // The click handler lives in /static/app.js, which the page loads.
    expect(html).toContain("/static/app.js");
  });

  test("renders a #meals container where meal cards are inserted by the client", async () => {
    const html = await homeHtml();

    expect(html).toMatch(/id="meals"/);
  });

  test("reflects the saved filter state on the rendered chips", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    const app = createApp(deps);
    await app.request("http://localhost/api/filter", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        includes: ["asparges"],
        excludes: ["jordbaer"],
      }),
    });

    const res = await app.request("http://localhost/");
    const html = await res.text();

    // Asparges chip is rendered with data-state="include".
    expect(html).toMatch(/data-slug="asparges"[^>]*data-state="include"|data-state="include"[^>]*data-slug="asparges"/);
    // Jordbær chip is rendered with data-state="exclude".
    expect(html).toMatch(/data-slug="jordbaer"[^>]*data-state="exclude"|data-state="exclude"[^>]*data-slug="jordbaer"/);
  });

  test("reflects the saved custom mandatory ingredients as chips", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    const app = createApp(deps);
    await app.request("http://localhost/api/custom-ingredients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Ris" }),
    });

    const res = await app.request("http://localhost/");
    const html = await res.text();

    expect(html).toContain("Ris");
    // The custom-mandatory chip has a remove button.
    expect(html).toMatch(/data-remove-custom="ris"/);
  });
});

describe("GET /static/:filename", () => {
  test("serves app.js with the right content type", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    const app = createApp(deps);

    const res = await app.request("http://localhost/static/app.js");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/javascript/);
    const body = await res.text();
    expect(body).toContain("Mailtid");
  });

  test("serves app.css with the right content type", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    const app = createApp(deps);

    const res = await app.request("http://localhost/static/app.css");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/css/);
  });

  test("returns 404 for an unknown file", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    const app = createApp(deps);

    const res = await app.request("http://localhost/static/missing.js");
    expect(res.status).toBe(404);
  });

  test("rejects path traversal attempts", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    const app = createApp(deps);

    const res = await app.request("http://localhost/static/..%2Fpackage.json");
    expect(res.status).toBe(403);
  });

  test("shows first-run banner when profile is empty", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    const app = createApp(deps);

    const res = await app.request("http://localhost/");
    const html = await res.text();

    expect(html).toContain("Velkommen");
    expect(html).toContain("fortæl os lidt om dig");
  });

  test("hides first-run banner once profile is set", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    deps.profile.save({
      dietaryPattern: "omnivore",
      allergies: [],
      dislikes: "",
    });
    const app = createApp(deps);

    const res = await app.request("http://localhost/");
    const html = await res.text();

    expect(html).not.toContain("Velkommen — fortæl os lidt om dig");
  });

  test("shows missing-API-key banner when key is empty", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6, hasApiKey: false });
    const app = createApp(deps);

    const res = await app.request("http://localhost/");
    const html = await res.text();

    expect(html).toContain("OpenCode API-nøgle");
  });

  test("hides missing-API-key banner when key is set", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6, hasApiKey: true });
    const app = createApp(deps);

    const res = await app.request("http://localhost/");
    const html = await res.text();

    expect(html).not.toContain("OpenCode API-nøgle");
  });

  test("includes a #thinking element with an AI reasoning label", async () => {
    const html = await homeHtml();

    expect(html).toMatch(/id="thinking"/);
    expect(html).toContain("AI&apos;ens tanker:");
  });
});
