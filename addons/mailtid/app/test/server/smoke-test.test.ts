/**
 * Tests for `bin/smoke-test.sh`.
 *
 * The smoke test is a bash script that asserts an HTTP endpoint
 * responds with a body containing an expected substring. These
 * tests spawn the script with `node:child_process` against a real
 * local HTTP server (the same shape as the real add-on's home
 * screen) and assert on the script's exit code.
 */
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { spawn } from "node:child_process";
import { describe, expect, test, afterEach, beforeEach } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
// test file lives at <repo>/addons/mailtid/app/test/server/, so 5
// `..` segments land at the repo root where `bin/` lives.
const REPO_ROOT = resolve(here, "..", "..", "..", "..", "..");
const SMOKE_SCRIPT = resolve(REPO_ROOT, "bin", "smoke-test.sh");

interface RunningServer {
  server: Server;
  port: number;
  /** Set the body the next / request should return. */
  setBody: (body: string) => void;
  /** Stop accepting new connections and close the listening socket. */
  close: () => Promise<void>;
}

async function startServer(): Promise<RunningServer> {
  let body = "Mailtid";
  const server = createServer((_req: IncomingMessage, res: ServerResponse) => {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end(body);
  });
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("smoke-test test: server failed to bind");
  }
  return {
    server,
    port: address.port,
    setBody: (next: string) => {
      body = next;
    },
    close: () =>
      new Promise<void>((resolveClose, rejectClose) => {
        server.close((err) => (err ? rejectClose(err) : resolveClose()));
      }),
  };
}

function runSmokeScript(...args: string[]): Promise<{ status: number; stderr: string }> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn("bash", [SMOKE_SCRIPT, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", rejectRun);
    child.on("close", (code) => {
      resolveRun({ status: code ?? -1, stderr });
    });
  });
}

describe("bin/smoke-test.sh", () => {
  let running: RunningServer | null = null;

  beforeEach(async () => {
    running = await startServer();
  });

  afterEach(async () => {
    if (running) {
      await running.close();
      running = null;
    }
  });

  test("exits 0 when the response body contains the expected substring", async () => {
    if (!running) throw new Error("test setup: server not running");
    running.setBody("Mailtid home screen — velkommen");
    const url = `http://127.0.0.1:${running.port}/`;
    const { status } = await runSmokeScript(url, "Mailtid");
    expect(status).toBe(0);
  });

  test("exits non-zero with a diagnostic when the body is missing the expected substring", async () => {
    if (!running) throw new Error("test setup: server not running");
    running.setBody("not the greeting you wanted");
    const url = `http://127.0.0.1:${running.port}/`;
    const { status, stderr } = await runSmokeScript(url, "Mailtid");
    expect(status).not.toBe(0);
    expect(stderr).toMatch(/Mailtid/);
  });

  test("exits non-zero when the URL is unreachable", async () => {
    if (!running) throw new Error("test setup: server not running");
    // Capture the port while the server is still up, then take it
    // down so the script's curl hits a closed socket.
    const deadPort = running.port;
    await running.close();
    running = null;
    const { status } = await runSmokeScript(`http://127.0.0.1:${deadPort}/`, "Mailtid");
    expect(status).not.toBe(0);
  });
});

describe("bin/smoke-test.sh — usage", () => {
  test("exits non-zero and prints usage when called with no arguments", async () => {
    const { status, stderr } = await runSmokeScript();
    expect(status).not.toBe(0);
    expect(stderr).toMatch(/usage:/);
  });

  test("exits non-zero and prints usage when called with only one argument", async () => {
    const { status, stderr } = await runSmokeScript("http://example.com");
    expect(status).not.toBe(0);
    expect(stderr).toMatch(/usage:/);
  });
});
