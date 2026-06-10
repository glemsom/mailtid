import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import type { SeasonalityRepository } from "../db/seasonality.js";
import type { FilterStateRepository } from "../db/filter-state.js";
import type { CustomIngredientsRepository } from "../db/custom-ingredients.js";
import type { ProfileRepository } from "../db/profile.js";
import type { SettingsRepository } from "../db/settings.js";
import type { FavouritesRepository } from "../db/favourites.js";
import type { CookedHistoryRepository } from "../db/cooked-history.js";
import type { InspirationService } from "../inspiration/service.js";
import type { RecipeService } from "../inspiration/recipe-service.js";
import { renderHomePage } from "./home-page.js";
import { renderSettingsPage } from "./settings-page.js";
import { renderFavouritesPage } from "./favourites-page.js";
import { renderAdminPage } from "./admin-page.js";

/**
 * Resolve the path to the bundled `static/` directory at build time.
 * Both `app.js` and `app.css` are static assets served by the app.
 * The path is stable regardless of process.cwd() because it is
 * resolved relative to this module's location.
 */
function staticDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..", "..", "static");
}

const STATIC_TYPES: Record<string, string> = {
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

/**
 * Dependencies the Hono app needs to serve the API. Injected so
 * tests can swap in `:memory:` SQLite and a `MockLLMClient`, and so
 * the production bootstrap can build the real ones.
 */
export interface AppDeps {
  /** Read-only access to the seasonality table. */
  seasonality: SeasonalityRepository;
  /** Read/write access to the user's in-season filter selection. */
  filterState: FilterStateRepository;
  /** Read/write access to the user's custom mandatory ingredients. */
  customIngredients: CustomIngredientsRepository;
  /** Read/write access to the user's dietary profile. */
  profile: ProfileRepository;
  /** Read/write access to settings (active model + model cache). */
  settings: SettingsRepository;
  /** Read/write access to favourites. */
  favourites: FavouritesRepository;
  /** Read/write access to cooked history. */
  cookedHistory: CookedHistoryRepository;
  /**
   * Whether the OpenCode API key is set (either via the HA add-on
   * options at startup or via the in-app settings page at runtime).
   * When false, the home page shows a missing-key message and
   * /api/inspiration returns 503 instead of attempting the LLM call.
   */
  hasApiKey(): boolean;
  /**
   * Refresh the cached model list from the OpenCode Go API.
   * No-op in tests; wired to the real fetch in production.
   * Returns a status message string.
   */
  refreshModelCache?: () => Promise<string>;
  /** Business logic for the 5-meal home-screen call. */
  inspiration: InspirationService;
  /** Business logic for the full-recipe card-tap call. */
  recipe: RecipeService;
  /**
   * Provider of the "current" month (1-12) so the home page can
   * label its in-season chips correctly.
   */
  monthProvider: () => number;
}

/**
 * Build the Mailtid HTTP app.
 *
 * The factory takes its dependencies explicitly so tests can
 * construct a fresh in-process app with an in-memory SQLite and a
 * mock LLM client, and the production bootstrap can build the real
 * ones from the add-on config.
 */
export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  app.get("/", (c) => {
    const month = deps.monthProvider();
    const inSeason = deps.seasonality.findInSeasonForMonth(month);
    const filter = deps.filterState.find();
    const custom = deps.customIngredients.list();
    const profile = deps.profile.find();
    return c.html(
      renderHomePage({ month, inSeason, filter, custom, profile, hasApiKey: deps.hasApiKey() }),
    );
  });

  /**
   * `GET /indstillinger` — the in-app settings page. Server-
   * rendered so the saved profile and model selection are visible
   * immediately without a JS round-trip.
   */
  app.get("/indstillinger", (c) => {
    return c.html(
      renderSettingsPage({
        profile: deps.profile.find(),
        models: deps.settings.listModels(),
        activeModel: deps.settings.getActiveModel(),
        hasApiKey: deps.hasApiKey(),
      }),
    );
  });

  /**
   * `GET /favouritter` — the favourites page. Server-rendered
   * so saved meals appear immediately without a JS round-trip.
   */
  app.get("/favouritter", (c) => {
    return c.html(
      renderFavouritesPage({
        favourites: deps.favourites.list(),
      }),
    );
  });

  /**
   * `GET /admin/seasonality` — the seasonality admin page.
   * Server-rendered with the full editable table.
   */
  app.get("/admin/seasonality", (c) => {
    return c.html(
      renderAdminPage({
        ingredients: deps.seasonality.findAll(),
      }),
    );
  });

  /**
   * `GET /static/:filename` — serve the bundled front-end assets
   * (app.js, app.css). Only top-level files are exposed; path
   * traversal is rejected.
   */
  app.get("/static/:filename", (c) => {
    const name = c.req.param("filename");
    if (name.includes("/") || name.includes("..")) {
      return c.text("forbidden", 403);
    }
    const path = resolve(staticDir(), name);
    if (!path.startsWith(staticDir())) {
      return c.text("forbidden", 403);
    }
    let body: string;
    try {
      body = readFileSync(path, "utf8");
    } catch {
      return c.text("not found", 404);
    }
    const ext = name.slice(name.lastIndexOf("."));
    const contentType =
      STATIC_TYPES[ext] ?? "application/octet-stream";
    return c.body(body, 200, { "content-type": contentType });
  });

  /**
   * `GET /api/seasonality?month=N` — return the in-season Danish
   * ingredients for month N (1-12). Defaults to the month provided
   * by the app's `monthProvider` if `?month=` is omitted, so the
   * home screen can fetch the current-month list without knowing
   * the system clock.
   */
  app.get("/api/seasonality", (c) => {
    const raw = c.req.query("month");
    const month = raw ? Number.parseInt(raw, 10) : NaN;
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return c.json({ error: "month must be an integer in 1-12" }, 400);
    }
    const ingredients = deps.seasonality.findInSeasonForMonth(month);
    return c.json({ month, ingredients });
  });

  /**
   * `POST /api/inspiration` — return 5 short-form Meal Inspirations
   * for the current month, constrained to the in-season Danish
   * ingredient list. The LLM does the heavy lifting; the handler
   * is a thin wrapper that maps parse / network errors to a 502.
   * Returns 503 when no API key is configured.
   */
  app.post("/api/inspiration", async (c) => {
    if (!deps.hasApiKey()) {
      warnLog("inspiration", "OpenCode API key not set");
      return c.json({
        error: "Indtast din OpenCode API-nøgle i indstillingerne",
      }, 503);
    }
    try {
      const meals = await deps.inspiration.shortForm();
      return c.json({ meals });
    } catch (err) {
      const underlying = (err as Error).message;
      warnLog("inspiration", underlying);
      return c.json({ error: "Kunne ikke få forslag — prøv igen" }, 502);
    }
  });

  /**
   * `POST /api/inspiration/recipe` — expand a single short-form
   * Meal Inspiration (the one the user just tapped) into a full
   * Danish recipe via a second, targeted LLM call. Body must be
   * JSON with `title` and `description`. Returns the full recipe
   * as JSON.
   */
  app.post("/api/inspiration/recipe", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "request body must be JSON" }, 400);
    }
    if (!body || typeof body !== "object") {
      return c.json({ error: "request body must be an object" }, 400);
    }
    const meal = body as { title?: unknown; description?: unknown };
    if (
      typeof meal.title !== "string" ||
      meal.title.length === 0 ||
      typeof meal.description !== "string" ||
      meal.description.length === 0
    ) {
      return c.json(
        { error: "title and description must be non-empty strings" },
        400,
      );
    }
    try {
      const recipe = await deps.recipe.fullRecipe({
        title: meal.title,
        description: meal.description,
      });
      return c.json(recipe);
    } catch (err) {
      const underlying = (err as Error).message;
      warnLog("recipe", underlying);
      return c.json({ error: "Kunne ikke få forslag — prøv igen" }, 502);
    }
  });

  /**
   * `GET /api/custom-ingredients` — return all custom mandatory
   * ingredients the user has typed in, oldest first. Items is an
   * array of `{ slug, nameDa }` so the UI can render with stable
   * identity and a human label.
   */
  app.get("/api/custom-ingredients", (c) => {
    return c.json({ items: deps.customIngredients.list() });
  });

  /**
   * `POST /api/custom-ingredients` — add a custom mandatory
   * ingredient. Body: `{ "name": "Ris" }`. Returns the stored
   * `{ slug, nameDa }` shape and 201 Created. Idempotent: a second
   * add of the same name returns the same shape with 201.
   */
  app.post("/api/custom-ingredients", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "request body must be JSON" }, 400);
    }
    if (!body || typeof body !== "object") {
      return c.json({ error: "request body must be an object" }, 400);
    }
    const raw = (body as { name?: unknown }).name;
    if (typeof raw !== "string" || raw.trim().length === 0) {
      return c.json({ error: "name must be a non-empty string" }, 400);
    }
    try {
      const stored = deps.customIngredients.add(raw);
      return c.json(stored, 201);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  /**
   * `DELETE /api/custom-ingredients/:slug` — remove a previously
   * added custom mandatory ingredient. Idempotent: 204 even when
   * the slug is not present, so the UI can call it without
   * checking first.
   */
  app.delete("/api/custom-ingredients/:slug", (c) => {
    const slug = decodeURIComponent(c.req.param("slug"));
    deps.customIngredients.remove(slug);
    return c.body(null, 204);
  });

  /**
   * `GET /api/filter` — return the user's current in-season filter
   * state. Slugs are the stable identifiers; the UI looks up the
   * Danish display names from `/api/seasonality` for rendering.
   */
  app.get("/api/filter", (c) => {
    return c.json(deps.filterState.find());
  });

  /**
   * `PUT /api/filter` — replace the saved in-season filter state.
   * Body: `{ "includes": ["asparges"], "excludes": ["champignon"] }`.
   * Both fields are required and must be string arrays. The
   * endpoint is idempotent — a second PUT with the same body
   * returns the same state.
   */
  app.put("/api/filter", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "request body must be JSON" }, 400);
    }
    if (!body || typeof body !== "object") {
      return c.json({ error: "request body must be an object" }, 400);
    }
    const obj = body as { includes?: unknown; excludes?: unknown };
    if (!isStringArray(obj.includes) || !isStringArray(obj.excludes)) {
      return c.json(
        { error: "includes and excludes must both be string arrays" },
        400,
      );
    }
    deps.filterState.save({ includes: obj.includes, excludes: obj.excludes });
    return c.json({ includes: obj.includes, excludes: obj.excludes });
  });

  /**
   * `GET /api/models` — return the cached OpenCode Go model list.
   * Grouped by tier (free first, then paid). Used by the model
   * picker on the settings page.
   */
  app.get("/api/models", (c) => {
    return c.json({ models: deps.settings.listModels() });
  });

  /**
   * `PUT /api/settings/apikey` — persist the user's OpenCode API
   * key from the in-app settings page. Body: `{ "apiKey": "sk-..." }`.
   * The key takes effect immediately for subsequent inspiration
   * calls — no container restart required.
   */
  app.put("/api/settings/apikey", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "request body must be JSON" }, 400);
    }
    if (!body || typeof body !== "object") {
      return c.json({ error: "request body must be an object" }, 400);
    }
    const obj = body as { apiKey?: unknown };
    if (typeof obj.apiKey !== "string") {
      return c.json({ error: "apiKey must be a string" }, 400);
    }
    deps.settings.setApiKey(obj.apiKey);
    return c.json({ ok: true });
  });

  /**
   * `PUT /api/settings` — persist the user's active model choice.
   * Body: `{ "activeModel": "opencode-go/glm-5.1" }`.
   */
  app.put("/api/settings", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "request body must be JSON" }, 400);
    }
    if (!body || typeof body !== "object") {
      return c.json({ error: "request body must be an object" }, 400);
    }
    const obj = body as { activeModel?: unknown };
    if (typeof obj.activeModel !== "string" || obj.activeModel.length === 0) {
      return c.json({ error: "activeModel must be a non-empty string" }, 400);
    }
    deps.settings.setActiveModel(obj.activeModel);
    return c.json({ ok: true });
  });

  /**
   * `POST /api/models/refresh` — force-refresh the cached model
   * catalogue from the OpenCode Go API. Delegates to the injected
   * {@link AppDeps.refreshModelCache}.
   */
  app.post("/api/models/refresh", async (c) => {
    if (!deps.refreshModelCache) {
      return c.json({ error: "model refresh not available" }, 503);
    }
    try {
      const status = await deps.refreshModelCache();
      return c.json({ ok: true, status });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 502);
    }
  });

  /**
   * `GET /api/profile` — return the user's dietary profile.
   * Returns `{ profile: null }` when the profile has not been
   * set yet (first-run signal for the home-screen banner).
   */
  app.get("/api/profile", (c) => {
    return c.json({ profile: deps.profile.find() });
  });

  /**
   * `PUT /api/profile` — update the user's dietary profile.
   * Body: `{ dietaryPattern, allergies, dislikes }`.
   * Validates dietary pattern and allergies against their
   * fixed option sets. Returns the saved profile.
   */
  app.put("/api/profile", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "request body must be JSON" }, 400);
    }
    if (!body || typeof body !== "object") {
      return c.json({ error: "request body must be an object" }, 400);
    }
    const obj = body as {
      dietaryPattern?: unknown;
      allergies?: unknown;
      dislikes?: unknown;
    };
    if (typeof obj.dietaryPattern !== "string") {
      return c.json({ error: "dietaryPattern must be a string" }, 400);
    }
    if (!Array.isArray(obj.allergies)) {
      return c.json({ error: "allergies must be an array" }, 400);
    }
    if (typeof obj.dislikes !== "string") {
      return c.json({ error: "dislikes must be a string" }, 400);
    }
    try {
      const profile = deps.profile.save({
        dietaryPattern: obj.dietaryPattern,
        allergies: obj.allergies as string[],
        dislikes: obj.dislikes,
      });
      return c.json({ profile });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  /**
   * `POST /api/favourites` — bookmark a Meal Inspiration.
   * Body: `{ "title": "...", "description": "..." }`.
   * Idempotent — same title returns the existing row.
   */
  app.post("/api/favourites", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "request body must be JSON" }, 400);
    }
    if (!body || typeof body !== "object") {
      return c.json({ error: "request body must be an object" }, 400);
    }
    const obj = body as { title?: unknown; description?: unknown };
    if (typeof obj.title !== "string" || obj.title.length === 0) {
      return c.json({ error: "title must be a non-empty string" }, 400);
    }
    if (typeof obj.description !== "string" || obj.description.length === 0) {
      return c.json({ error: "description must be a non-empty string" }, 400);
    }
    const saved = deps.favourites.add({
      title: obj.title,
      description: obj.description,
    });
    return c.json(saved, 201);
  });

  /**
   * `GET /api/favourites` — return all saved favourites, newest first.
   */
  app.get("/api/favourites", (c) => {
    return c.json({ favourites: deps.favourites.list() });
  });

  /**
   * `GET /api/admin/seasonality` — list all ingredients in the
   * seasonality table, grouped by slug with their months array.
   * Used by the admin UI to render the editable table.
   */
  app.get("/api/admin/seasonality", (c) => {
    return c.json({ ingredients: deps.seasonality.findAll() });
  });

  /**
   * `PUT /api/admin/seasonality/:slug` — update or create a single
   * ingredient. Body: `{ "nameDa": "...", "months": [1,2,3] }`.
   * Months must be an array of integers in 1-12.
   */
  app.put("/api/admin/seasonality/:slug", async (c) => {
    const slug = decodeURIComponent(c.req.param("slug"));
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "request body must be JSON" }, 400);
    }
    if (!body || typeof body !== "object") {
      return c.json({ error: "request body must be an object" }, 400);
    }
    const obj = body as { nameDa?: unknown; months?: unknown };
    if (typeof obj.nameDa !== "string" || obj.nameDa.trim().length === 0) {
      return c.json({ error: "nameDa must be a non-empty string" }, 400);
    }
    if (!isMonthArray(obj.months)) {
      return c.json({ error: "months must be an array of integers in 1-12" }, 400);
    }
    deps.seasonality.upsert(slug, obj.nameDa.trim(), obj.months);
    return c.json({ slug, nameDa: obj.nameDa.trim(), months: obj.months });
  });

  /**
   * `POST /api/admin/seasonality` — create a new ingredient with a
   * slug derived from the Danish name. Body: `{ "nameDa": "...",
   * "months": [1,2,3] }`.
   */
  app.post("/api/admin/seasonality", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "request body must be JSON" }, 400);
    }
    if (!body || typeof body !== "object") {
      return c.json({ error: "request body must be an object" }, 400);
    }
    const obj = body as { nameDa?: unknown; months?: unknown };
    if (typeof obj.nameDa !== "string" || obj.nameDa.trim().length === 0) {
      return c.json({ error: "nameDa must be a non-empty string" }, 400);
    }
    if (!isMonthArray(obj.months)) {
      return c.json({ error: "months must be an array of integers in 1-12" }, 400);
    }
    const slug = sluggify(obj.nameDa.trim());
    deps.seasonality.upsert(slug, obj.nameDa.trim(), obj.months);
    return c.json({ slug, nameDa: obj.nameDa.trim(), months: obj.months }, 201);
  });

  /**
   * `DELETE /api/admin/seasonality/:slug` — remove every row for
   * the given ingredient. Idempotent — always returns 204.
   */
  app.delete("/api/admin/seasonality/:slug", (c) => {
    const slug = decodeURIComponent(c.req.param("slug"));
    deps.seasonality.deleteBySlug(slug);
    return c.body(null, 204);
  });

  /**
   * `POST /api/admin/seasonality/reset` — wipe all DB rows and
   * re-import from `seasonality.json`. The "Nulstil til seed"
   * action from the admin UI.
   */
  app.post("/api/admin/seasonality/reset", (c) => {
    deps.seasonality.resetSeed();
    const count = deps.seasonality.findAll().length;
    return c.json({ ok: true, count });
  });

  /**
   * `POST /api/cooked` — stamp a meal as cooked.
   * Body: `{ "title": "...", "description": "..." }`.
   * Always inserts a new row so the 14-day window tracks every cook.
   */
  app.post("/api/cooked", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "request body must be JSON" }, 400);
    }
    if (!body || typeof body !== "object") {
      return c.json({ error: "request body must be an object" }, 400);
    }
    const obj = body as { title?: unknown; description?: unknown };
    if (typeof obj.title !== "string" || obj.title.length === 0) {
      return c.json({ error: "title must be a non-empty string" }, 400);
    }
    if (typeof obj.description !== "string" || obj.description.length === 0) {
      return c.json({ error: "description must be a non-empty string" }, 400);
    }
    const stamped = deps.cookedHistory.stamp({
      title: obj.title,
      description: obj.description,
    });
    return c.json(stamped, 201);
  });

  return app;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function isMonthArray(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (v) => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 12,
    )
  );
}

/**
 * Derive a stable ASCII slug from a Danish ingredient name.
 * Strips diacritics, lowercases, replaces spaces with underscores,
 * and removes any remaining non-ASCII characters.
 */
function sluggify(nameDa: string): string {
  return nameDa
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

/**
 * Log an error or warning with the `mailtid:` prefix so log
 * messages are easy to find in the container output.
 */
function warnLog(context: string, detail: string): void {
  console.warn(`mailtid: ${context}: ${detail}`);
}

export type App = ReturnType<typeof createApp>;
