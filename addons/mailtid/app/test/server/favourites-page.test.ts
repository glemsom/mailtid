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

describe("GET /favouritter", () => {
  test("returns an HTML page with a Danish title", async () => {
    const { deps } = makeTestDeps({ cannedResponse: FIVE_MEALS, month: 6 });
    const app = createApp(deps);

    const res = await app.request("http://localhost/favouritter");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Favouritter");
    expect(html).toContain("<html lang=\"da\">");
  });

  test("lists saved favourites when they exist", async () => {
    const { deps } = makeTestDeps({ cannedResponse: FIVE_MEALS, month: 6 });
    const app = createApp(deps);

    // Add a favourite.
    await app.request("http://localhost/api/favourites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Jordbærtærte",
        description: "Sprød tærte med friske jordbær.",
      }),
    });

    const res = await app.request("http://localhost/favouritter");
    const html = await res.text();
    expect(html).toContain("Jordbærtærte");
    expect(html).toContain("Sprød tærte med friske jordbær.");
  });

  test("shows an empty-state message when no favourites exist", async () => {
    const { deps } = makeTestDeps({ cannedResponse: FIVE_MEALS, month: 6 });
    const app = createApp(deps);

    const res = await app.request("http://localhost/favouritter");
    const html = await res.text();
    expect(html).toContain("Ingen favoritter");
  });

  test("has a link back to the home page", async () => {
    const { deps } = makeTestDeps({ cannedResponse: FIVE_MEALS, month: 6 });
    const app = createApp(deps);

    const res = await app.request("http://localhost/favouritter");
    const html = await res.text();
    expect(html).toContain('href="/"');
  });
});
