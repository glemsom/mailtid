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

describe("GET /indstillinger — pantry (basisvarer)", () => {
  test("renders a pantry management section with Danish heading", async () => {
    const html = await settingsHtml();

    expect(html).toContain("Basisvarer");
    expect(html).toContain("pantry-input");
    expect(html).toContain("pantry-form");
  });

  test("renders current pantry items in the management list", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    deps.pantry.add("Ris");
    deps.pantry.add("Olie");
    const app = createApp(deps);
    const res = await app.request("http://localhost/indstillinger");
    const html = await res.text();

    expect(html).toContain("Ris");
    expect(html).toContain("Olie");
  });

  test("renders a 'Tilføj' (add) button for pantry", async () => {
    const html = await settingsHtml();

    expect(html).toContain("Tilføj");
  });

  test("renders remove buttons for each pantry item", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    deps.pantry.add("Salt");
    const app = createApp(deps);
    const res = await app.request("http://localhost/indstillinger");
    const html = await res.text();

    expect(html).toContain("Fjern");
  });

  test("renders a hint about what pantry staples are", async () => {
    const html = await settingsHtml();

    expect(html.toLowerCase()).toContain("altid har på lager");
  });
});
