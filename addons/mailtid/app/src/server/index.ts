import { createApp } from "./app.js";
import { loadRuntimeConfig, startServer } from "./bootstrap.js";
import { buildAppDeps } from "./deps.js";
import { setLogLevel, log } from "./logger.js";

const config = loadRuntimeConfig();
setLogLevel(config.logLevel);

const deps = buildAppDeps(config);
const app = createApp(deps);

// Fetch models from OpenCode Go on startup (fire-and-forget, so the
// server starts immediately even if the model catalogue is unreachable.
// The settings page will show an empty picker until the fetch completes
// or the user manually clicks "Opdater modeller").
if (deps.refreshModelCache) {
  deps.refreshModelCache().then(
    (status) => log.info("models", `cache refreshed — ${status}`),
    (err) => log.warn("models", `cache refresh failed — ${(err as Error).message}`),
  );
}

startServer(app, config)
  .then((server) => {
    log.info(
      "server",
      `listening on 0.0.0.0:${server.port} (log_level=${config.logLevel}, language=${config.defaultLanguage})`,
    );
  })
  .catch((err) => {
    log.error("server", err);
    process.exit(1);
  });
