import { createApp } from "./app.js";
import { loadRuntimeConfig, startServer } from "./bootstrap.js";
import { buildAppDeps } from "./deps.js";

const config = loadRuntimeConfig();
const deps = buildAppDeps(config);
const app = createApp(deps);

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
