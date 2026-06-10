import { createApp } from "./app.js";
import { loadRuntimeConfig, startServer } from "./bootstrap.js";

const config = loadRuntimeConfig();
const app = createApp();

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
