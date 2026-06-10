import { readFileSync } from "node:fs";
import { serve } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";
import type { Hono } from "hono";
import {
  defaults,
  HA_OPTIONS_FILE,
  loadConfigFromOptionsJson,
  type MailtidConfig,
} from "./config.js";

/**
 * Load the running config. Reads the HA options file if present,
 * otherwise returns defaults. Designed to never throw — a malformed
 * file or missing path both fall back to defaults.
 *
 * The path can be overridden with the `MAILTID_OPTIONS_FILE` env var,
 * which is useful for local development where `/data/options.json`
 * does not exist.
 */
export function loadRuntimeConfig(
  path: string = process.env.MAILTID_OPTIONS_FILE ?? HA_OPTIONS_FILE,
): MailtidConfig {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return defaults();
  }
  return loadConfigFromOptionsJson(raw);
}

/**
 * A handle to the running HTTP server. Call {@link stopServer} to
 * release the port. Returned by {@link startServer}.
 */
export interface RunningServer {
  port: number;
  close(): Promise<void>;
}

/**
 * Bind the Hono app to the configured port and start serving.
 * Returns the actually-bound port (which may differ from the
 * requested one if the OS reassigned, e.g. when port 0 is passed).
 */
export function startServer(
  app: Hono,
  config: MailtidConfig,
): Promise<RunningServer> {
  return new Promise((resolve, reject) => {
    let handle: ServerType;
    try {
      handle = serve(
        {
          fetch: app.fetch,
          port: config.port,
          hostname: "0.0.0.0",
        },
        (info) => {
          resolve({
            port: info.port,
            close: () => closeServer(handle),
          });
        },
      );
    } catch (err) {
      reject(err);
      return;
    }
    handle.on("error", (err: Error) => reject(err));
  });
}

function closeServer(handle: ServerType): Promise<void> {
  return new Promise((resolve, reject) => {
    handle.close((err) => (err ? reject(err) : resolve()));
  });
}
