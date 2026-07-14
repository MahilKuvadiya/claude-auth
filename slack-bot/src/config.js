// Central config for the claudex Slack bot. Every value is env-overridable;
// secrets come from Secret Manager in Cloud Run. Mirrors backend-api/src/config.js.

export const config = {
  // Slack app credentials (Secret Manager in prod).
  slackBotToken: process.env.SLACK_BOT_TOKEN || "",       // xoxb-…
  slackSigningSecret: process.env.SLACK_SIGNING_SECRET || "",

  // backend-api base + the bot's service credential for calling /v1.
  apiUrl: process.env.API_URL || "https://claudex-api-prod-tvjj3mwixq-el.a.run.app",
  botToken: process.env.CLAUDEX_BOT_TOKEN || "",          // shared secret; see PLAN §3

  // Where "Open the full dashboard" links to.
  dashboardUrl: process.env.DASHBOARD_URL || "https://docs.devxlabs.ai",

  port: Number(process.env.PORT || 8080),
  logLevel: process.env.LOG_LEVEL || "info",
};

// Fail fast at startup (not at import — tests import the view/config modules).
export function validateConfig() {
  const missing = ["slackBotToken", "slackSigningSecret", "botToken"].filter(
    (k) => !config[k],
  );
  if (missing.length) {
    const envs = { slackBotToken: "SLACK_BOT_TOKEN", slackSigningSecret: "SLACK_SIGNING_SECRET", botToken: "CLAUDEX_BOT_TOKEN" };
    throw new Error(`missing required env: ${missing.map((k) => envs[k]).join(", ")}`);
  }
}
