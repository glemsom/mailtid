import { afterEach, describe, expect, test } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../../src/server/app.js";
import {
  loadRuntimeConfig,
  startServer,
  type RunningServer,
} from "../../src/server/bootstrap.js";
import {
  defaults,
  loadConfigFromOptionsJson,
  type MailtidConfig,
} from "../../src/server/config.js";
import { makeTestDeps } from "../helpers/deps.js";

const FIXED_CONFIG: MailtidConfig = {
  opencodeApiKey: "",
  logLevel: "error",
  port: 0, // OS-assigned
  defaultLanguage: "da",
};

const CANNED = JSON.stringify({ meals: [] });

let running: RunningServer | undefined;

afterEach(async () => {
  if (running) {
    await running.close();
    running = undefined;
  }
});

describe("HTTP server", () => {
  test("binds to the configured port and serves the home greeting", async () => {
    const { deps } = makeTestDeps({ cannedResponse: CANNED, month: 6 });
    const app = createApp(deps);
    running = await startServer(app, FIXED_CONFIG);

    const res = await fetch(`http://127.0.0.1:${running.port}/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("Mailtid");
  });
});

describe("loadConfigFromOptionsJson", () => {
  test("returns defaults for an empty string", () => {
    expect(loadConfigFromOptionsJson("")).toEqual(defaults());
  });

  test("returns defaults for malformed JSON", () => {
    expect(loadConfigFromOptionsJson("{not json")).toEqual(defaults());
  });

  test("returns defaults for a non-object payload", () => {
    expect(loadConfigFromOptionsJson("42")).toEqual(defaults());
  });

  test("parses the four add-on options from a valid options.json", () => {
    const json = JSON.stringify({
      opencode_api_key: "sk-test",
      log_level: "debug",
      port: 9100,
      default_language: "en",
    });
    const config = loadConfigFromOptionsJson(json);
    expect(config).toEqual({
      opencodeApiKey: "sk-test",
      logLevel: "debug",
      port: 9100,
      defaultLanguage: "en",
    });
  });

  test("falls back to defaults for malformed values", () => {
    const json = JSON.stringify({
      log_level: "loud",
      port: -1,
      default_language: "",
    });
    expect(loadConfigFromOptionsJson(json)).toEqual({
      opencodeApiKey: "",
      logLevel: "info",
      port: 8200,
      defaultLanguage: "da",
    });
  });
});

describe("loadRuntimeConfig", () => {
  test("returns defaults when the options file does not exist", () => {
    const dir = mkdtempSync(join(tmpdir(), "mailtid-cfg-"));
    try {
      expect(loadRuntimeConfig(join(dir, "missing.json"))).toEqual(defaults());
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("reads a real options.json from disk", () => {
    const dir = mkdtempSync(join(tmpdir(), "mailtid-cfg-"));
    try {
      const path = join(dir, "options.json");
      writeFileSync(
        path,
        JSON.stringify({
          opencode_api_key: "sk-live",
          log_level: "warn",
          port: 9999,
          default_language: "da",
        }),
      );
      expect(loadRuntimeConfig(path)).toEqual({
        opencodeApiKey: "sk-live",
        logLevel: "warn",
        port: 9999,
        defaultLanguage: "da",
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
