import { Hono } from "hono";
import type { SeasonalityRepository } from "../db/seasonality.js";
import type { InspirationService } from "../inspiration/service.js";
import type { RecipeService } from "../inspiration/recipe-service.js";

/**
 * Dependencies the Hono app needs to serve the API. Injected so
 * tests can swap in `:memory:` SQLite and a `MockLLMClient`, and so
 * the production bootstrap can build the real ones.
 */
export interface AppDeps {
  /** Read-only access to the seasonality table. */
  seasonality: SeasonalityRepository;
  /** Business logic for the 5-meal home-screen call. */
  inspiration: InspirationService;
  /** Business logic for the full-recipe card-tap call. */
  recipe: RecipeService;
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

  app.get("/", (c) => c.text("Mailtid"));

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
   */
  app.post("/api/inspiration", async (c) => {
    try {
      const meals = await deps.inspiration.shortForm();
      return c.json({ meals });
    } catch (err) {
      const message = (err as Error).message;
      return c.json({ error: message }, 502);
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
      const message = (err as Error).message;
      return c.json({ error: message }, 502);
    }
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
