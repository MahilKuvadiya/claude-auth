// Build the Bolt app (HTTP mode — Slack POSTs events to Cloud Run's public URL).

import bolt from "@slack/bolt";
import { config } from "./config.js";
import { registerAppHome } from "./listeners/appHome.js";
import { registerActions } from "./listeners/actions.js";
import { registerCommands } from "./listeners/commands.js";

const { App, LogLevel } = bolt;

export function buildApp() {
  const app = new App({
    token: config.slackBotToken,
    signingSecret: config.slackSigningSecret,
    logLevel: config.logLevel === "debug" ? LogLevel.DEBUG : LogLevel.INFO,
    // Cloud Run liveness probe hits "/" — answer it without a Slack signature.
    customRoutes: [
      {
        path: "/health",
        method: ["GET"],
        handler: (_req, res) => {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        },
      },
    ],
  });

  registerAppHome(app);
  registerActions(app);
  registerCommands(app);
  return app;
}
