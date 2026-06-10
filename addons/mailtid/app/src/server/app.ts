import { Hono } from "hono";

/**
 * Build the Mailtid HTTP app.
 *
 * The factory takes no arguments so tests can construct a fresh
 * in-process app without reading from process.env.
 */
export function createApp(): Hono {
  const app = new Hono();

  app.get("/", (c) => c.text("Mailtid"));

  return app;
}

export type App = ReturnType<typeof createApp>;
