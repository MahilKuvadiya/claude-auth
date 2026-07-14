// Entry point. Validates config, starts the Bolt HTTP server on Cloud Run's PORT.

import { buildApp } from "./app.js";
import { config, validateConfig } from "./config.js";

validateConfig();

const app = buildApp();

const shutdown = async (sig) => {
  app.logger.info(`${sig} received — shutting down`);
  try {
    await app.stop();
  } finally {
    process.exit(0);
  }
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

await app.start(config.port);
app.logger.info(`⚡️ claudex slack bot listening on :${config.port}`);
