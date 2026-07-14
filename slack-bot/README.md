# claudex Slack bot

Brings claudex pool management into Slack: an **App Home dashboard** (live usage +
headroom per member) and **admin controls** (invite / revoke / create pool), all
**role-gated** — everyone can view, only claudex `org_admin`s can mutate.

It's a thin **Slack Bolt (HTTP mode)** service on Cloud Run that calls the existing
[`backend-api`](../backend-api) `/v1` endpoints. No per-Mac agent. Design doc:
[`../research/slack-bot/PLAN.md`](../research/slack-bot/PLAN.md).

## Layout

```
src/
  index.js            entry — validate config, start Bolt on $PORT
  app.js              build the Bolt app + /health route, register listeners
  config.js           env config (+ validateConfig)
  lib/
    backend.js        client for backend-api /v1 (x-bot-token + x-acting-email)
    identity.js       Slack user → claudex {email, role}; requireAdmin()
    data.js           merge pools + members + live usage for the view
  views/
    blocks.js         pure Block Kit helpers (bar, severity, section…)
    appHome.js        the App Home dashboard (pure: identity+pools → view)
    modals.js         invite / create-pool modals
  listeners/
    appHome.js        app_home_opened + refresh
    actions.js        invite / revoke / create-pool buttons & modal submits
    commands.js       /claudex usage
test/                 pure unit tests (node --test) for the view builders
manifest.yaml         Slack app manifest (scopes, events, slash command)
```

## Config (env)

| Var | Meaning |
|-----|---------|
| `SLACK_BOT_TOKEN` | Bot token (`xoxb-…`). Secret Manager in prod. |
| `SLACK_SIGNING_SECRET` | Verifies inbound Slack requests. |
| `CLAUDEX_BOT_TOKEN` | Service credential the bot sends to backend-api (`x-bot-token`). |
| `API_URL` | backend-api base (default: prod Cloud Run URL). |
| `DASHBOARD_URL` | "Open the full dashboard" link. |
| `PORT` | Injected by Cloud Run (default 8080). |

## Develop

```bash
npm install
npm test          # pure view/logic tests, no Slack needed
npm run dev       # needs the env vars above
```

## Deploy (Cloud Run)

```bash
gcloud run deploy claudex-slack-bot --source . --region asia-south1 --allow-unauthenticated
```

Then create the Slack app from `manifest.yaml`, set the request URLs to
`https://<service-url>/slack/events`, and store the tokens in Secret Manager.

## Status

- **P1 (this PR):** read-only App Home dashboard + `/claudex usage`, identity/role
  resolution, admin action scaffolding.
- **Backend TODO (PLAN §3):** the `x-bot-token` auth path and `GET /v1/whoami` in
  backend-api. Until those land, `/v1` calls will 401 and the Home tab shows the
  "not in a pool yet" state — the UI, role-gating, and views are all testable now.
- **Next:** P2 wire admin mutations end-to-end · P3 polish · P4 proactive alerts.
