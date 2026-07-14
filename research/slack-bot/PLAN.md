# claudex Slack bot — Plan

> Bring claudex pool management into Slack, where the team already lives.
> **v1 scope: team backend only** (talks to `backend-api`, no per-Mac agent).
> Centerpiece: an **App Home dashboard** + **admin controls**, **role-gated**
> (everyone views; only `org_admin`s mutate).

## 1. Why / what

claudex has two halves:

- **Local CLI** (each dev's Mac) — `switch`, `pool`, `keep-warm`, `session`. These
  run on a machine; Slack can't drive them without an agent per Mac. **Out of scope for v1.**
- **Team backend** (`backend-api` on Cloud Run) — pools, members, join-links, usage,
  rollups. A web service a bot can call directly. **This is v1.**

The backend already exposes everything we need (`/v1/pools`, `/members`, `/usage`,
`/rollups`, `/join-links`, `DELETE …/members/:mid`) and the scheduler already refreshes
per-member headroom every 15 min. So the bot is mostly **Slack UX over existing data** —
little new backend work.

## 2. Architecture

```
Slack ──slash cmds / buttons / App Home──►  claudex-slack-bot  ──/v1──►  backend-api ──► Firestore/SM
      ◄──── alerts / digests (P4) ────────  (Bolt · Cloud Run)  ◄─alerts─ scheduler/Pub-Sub
```

- New `slack-bot/` component — **Slack Bolt for JavaScript**, Node 22, ESM (matches
  `backend-api`). Deployed on **Cloud Run**, `asia-south1`, same project, keyless-WIF CI.
- **HTTP events mode** (Slack POSTs to a public URL; verified by the signing secret) —
  stateless, scales with Cloud Run. Bot token + signing secret in **Secret Manager**.

## 3. Identity & authorization (the crux)

1. **Slack user → claudex identity by email.** `users:read.email` gives the Slack user's
   address → resolve their claudex role (org_admin / member / none). Cache the mapping in
   Firestore `slackLinks/{slackUserId}` → `{email, uid|memberId, orgId, role}` so role
   resolves without a `users.info` round-trip each time.
2. **Bot → backend-api.** The bot is a new trusted service caller. Give it a **bot service
   identity** (Firebase custom token with an admin claim, or an `INTERNAL_TOKEN`-style
   shared secret — same pattern as `/v1/internal/poll-usage`). The bot then **enforces the
   acting Slack user's role itself**: only claudex `org_admin`s may invoke mutations.
3. **Role gating.**
   - *mapped member* → view App Home (their pools + usage), `/claudex usage`.
   - *org_admin* → the above **plus** the action buttons/modals.
   - *unmapped* → friendly "ask your admin to invite you" (admin @-mentioned).

### Backend changes (done)

- [x] **Bot auth path** — `authUser` now accepts `x-bot-token` + `x-acting-email`; the
      email's role is still resolved SERVER-SIDE via `resolveActor`. One edit; every
      control route (`authFirebase`) works for bot admins automatically.
- [x] **`GET /v1/me/pools`** — the acting user's pools with member rosters + cached
      headroom, role-scoped (admin→all, pod_lead→org, member→their pools). Powers the App
      Home in one call, using the 15-min scheduler's `rateLimit` snapshot (no live calls).
- Identity comes from the existing **`GET /v1/me`**; invite/revoke/create reuse the existing
      control routes. Roles are `admin` / `pod_lead` / `member`.

## 4. App Home dashboard (centerpiece)

On `app_home_opened`, publish a Block Kit view by role:

- **Your pools** — name · mode · member count · headroom summary (`▇▇▁ 2/5 seats <50%`)
- **Live usage** (`GET /v1/pools/:id/usage`) — member · tier · session% · week% · status dot
- **Admin buttons** *(org_admin only)* — `➕ Invite` · `🔀 Create pool` · per-member `Revoke`
  · `Mode` toggle
- `↻ Refresh` + deep link to the full web dashboard

The view builders are **pure functions** (`src/views/*`) so they're unit-testable without Slack.

## 5. Admin flows = buttons + modals (no flags to memorize)

- **Invite** → modal (pool dropdown + email) → `POST /v1/pools/:id/join-links` → posts the
  `claudex pool join <token>` command; DMs the invitee if they're in the workspace.
- **Revoke** → confirm modal → `DELETE /v1/pools/:id/members/:mid`.
- **Create pool** → modal (name + failover/balance) → `POST /v1/pools`.
- Non-admins get an ephemeral "admins only"; unmapped users get the invite hint.

## 6. Slack app config

- **Bot scopes:** `commands`, `chat:write`, `users:read`, `users:read.email`, `im:write`,
  `app_home` (`views.publish`).
- **Events:** `app_home_opened`.
- **Interactivity:** on (buttons + modals). A checked-in `manifest.yaml` defines all of this.

## 7. Build phases

- **P0** — Slack app + manifest, secrets in SM, scaffold `slack-bot/`, deploy skeleton to
  Cloud Run, verify events. *(this PR: scaffold + read-only App Home)*
- **P1** — Identity mapping + **read-only App Home** (pools + usage) → value for everyone.
- **P2** — Admin controls (invite / revoke / create / mode) via modals + role-gating.
- **P3** — Slash-command shortcuts (`/claudex usage`, `/claudex invite`) + polish
  (loading/error states, deep links).
- **P4 (fast-follow)** — proactive alerts + daily digest (scheduler already computes
  per-member headroom every 15 min → cheap threshold-crossing notifications).

## 8. Non-goals (v1)

- Per-Mac local actions (`switch`/`keep-warm`/`session`) — needs an agent on each machine.
- Public Slack App Directory distribution — start as an internal devxlabs app.
