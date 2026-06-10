import { createApp } from "./app.js";
import { loadRuntimeConfig, startServer } from "./bootstrap.js";
import { buildAppDeps } from "./deps.js";

const config = loadRuntimeConfig();
const deps = buildAppDeps(config);
const app = createApp(deps);

// Fetch models from OpenCode Go on startup (fire-and-forget, so the
// server starts immediately even if the model catalogue is unreachable.
// The settings page will show an empty picker until the fetch completes
// or the user manually clicks "Opdater modeller").
if (deps.refreshModelCache) {
  deps.refreshModelCache().then(
    (status) => {
      // eslint-disable-next-line no-console
      console.log(`mailtid: model cache refreshed — ${status}`);
    },
    (err) => {
      // eslint-disable-next-line no-console
      console.warn(`mailtid: model cache refresh failed — ${(err as Error).message}`);
    },
  );
}

startServer(app, config)
  .then((server) => {
    // eslint-disable-next-line no-console
    console.log(
      `mailtid: listening on 0.0.0.0:${server.port} (log_level=${config.logLevel}, language=${config.defaultLanguage})`,
    );
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("mailtid: failed to start", err);
    process.exit(1);
  });
