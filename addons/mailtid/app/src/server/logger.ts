import type { LogLevel } from "./config.js";

const LEVEL_ORDER: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
};

let currentLevel: LogLevel = "info";

/** Set the logger threshold. Messages below this level are silently dropped. */
export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function enabled(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel];
}

function fmt(level: LogLevel, context: string, msg: string): string {
  const ts = new Date().toISOString();
  return `mailtid: ${ts} [${level.toUpperCase()}] ${context}: ${msg}`;
}

function stringify(err: unknown): string {
  if (err instanceof Error) {
    return `${err.name}: ${err.message}\n${err.stack ?? "(no stack)"}`;
  }
  return typeof err === "string" ? err : JSON.stringify(err);
}

export const log = {
  trace(context: string, msg: string): void {
    if (enabled("trace")) console.debug(fmt("trace", context, msg));
  },

  debug(context: string, msg: string): void {
    if (enabled("debug")) console.debug(fmt("debug", context, msg));
  },

  info(context: string, msg: string): void {
    if (enabled("info")) console.log(fmt("info", context, msg));
  },

  warn(context: string, msg: string): void {
    if (enabled("warn")) console.warn(fmt("warn", context, msg));
  },

  error(context: string, err: unknown): void {
    if (enabled("error")) {
      console.error(fmt("error", context, stringify(err)));
    }
  },
};
