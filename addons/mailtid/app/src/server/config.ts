/**
 * Mailtid add-on configuration.
 *
 * The Home Assistant Supervisor passes add-on options to the container
 * as a JSON file at {@link HA_OPTIONS_FILE}. We read it here, validate,
 * and hand the typed config to the rest of the app. For local
 * development and tests, a raw env map is accepted instead.
 */

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

const VALID_LOG_LEVELS: ReadonlySet<LogLevel> = new Set([
  "trace",
  "debug",
  "info",
  "warn",
  "error",
]);

/** Path the HA Supervisor writes add-on options to inside the container. */
export const HA_OPTIONS_FILE = "/data/options.json";

export interface MailtidConfig {
  /** OpenCode Go API key. Empty when the user has not set it. */
  opencodeApiKey: string;
  /** Logger threshold. Defaults to "info". */
  logLevel: LogLevel;
  /** HTTP port to listen on. Defaults to 8200. */
  port: number;
  /** UI / LLM language. Defaults to "da". */
  defaultLanguage: string;
}

export interface RawOptions {
  opencode_api_key?: string;
  log_level?: string;
  port?: number;
  default_language?: string;
}

export function loadConfigFromOptionsJson(json: string): MailtidConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return defaults();
  }
  if (!parsed || typeof parsed !== "object") return defaults();

  const o = parsed as RawOptions;
  return {
    opencodeApiKey:
      typeof o.opencode_api_key === "string" ? o.opencode_api_key : "",
    logLevel: parseLogLevel(o.log_level),
    port: parsePortNumber(o.port),
    defaultLanguage:
      typeof o.default_language === "string" && o.default_language.length > 0
        ? o.default_language
        : "da",
  };
}

export function defaults(): MailtidConfig {
  return {
    opencodeApiKey: "",
    logLevel: "info",
    port: 8200,
    defaultLanguage: "da",
  };
}

function parseLogLevel(value: string | undefined): LogLevel {
  if (!value) return "info";
  if (VALID_LOG_LEVELS.has(value as LogLevel)) {
    return value as LogLevel;
  }
  return "info";
}

function parsePortNumber(value: number | undefined): number {
  if (typeof value !== "number") return 8200;
  if (!Number.isFinite(value) || value <= 0 || value > 65535) return 8200;
  return Math.floor(value);
}
