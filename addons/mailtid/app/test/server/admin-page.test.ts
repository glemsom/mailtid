import { describe, expect, test } from "vitest";
import { createApp } from "../../src/server/app.js";
import { makeTestDeps } from "../helpers/deps.js";

const CANNED = JSON.stringify({ meals: [] });

async function adminHtml(): Promise<string> {
  const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
  const app = createApp(deps);
  const res = await app.request("http://localhost/admin/seasonality");
  expect(res.status).toBe(200);
  return res.text();
}

describe("GET /admin/seasonality (admin page)", () => {
  test("renders server-rendered HTML with Danish admin title", async () => {
    const html = await adminHtml();

    expect(html.toLowerCase()).toContain("<!doctype html>");
    expect(html).toContain("Mailtid — Admin");
    expect(html).toContain("Sæsondata");
  });

  test("renders the ingredient table with rows", async () => {
    const html = await adminHtml();

    expect(html).toContain("<tbody");
    // Spot-check: Jordbær should appear.
    expect(html).toContain("Jordbær");
    // The table should have data-slug attributes for edit/delete targeting.
    expect(html).toContain('data-slug="jordbaer"');
  });

  test("renders an add-new-ingredient form", async () => {
    const html = await adminHtml();

    expect(html).toContain("Tilføj ny råvare");
    expect(html).toContain('id="add-form"');
    expect(html).toContain('id="add-name"');
  });

  test("renders month checkboxes for the add form", async () => {
    const html = await adminHtml();

    // The add form should have 12 month toggles.
    expect(html).toContain('id="add-months"');
    expect(html).toContain("Jan");
    expect(html).toContain("Dec");
  });

  test("renders a 'Nulstil til seed' button", async () => {
    const html = await adminHtml();

    expect(html).toContain("Nulstil til seed");
    expect(html).toContain('id="reset-btn"');
  });

  test("renders edit, save, cancel, and delete buttons per row", async () => {
    const html = await adminHtml();

    expect(html).toContain("edit-btn");
    expect(html).toContain("save-btn");
    expect(html).toContain("cancel-btn");
    expect(html).toContain("delete-btn");
  });

  test("renders month checkboxes in each table row", async () => {
    const html = await adminHtml();

    // Each row should have month checkboxes with data-month attributes.
    expect(html).toContain('data-month="6"');
    expect(html).toContain('data-month="12"');
  });
});
