# claudex Analytics — Dashboard & Backend API (Developer Guide)

A deep, self-contained guide to the **analytics platform**: the `backend-api` (Fastify + Prisma +
Postgres on Cloud Run) and the `dashboard-app` (Vite + React SPA). It explains how everything is
built, how the pieces talk to each other, how to run it locally, and how to extend it.

> **Reading this to build your own API?** This document doubles as an **implementation contract**. If
> you are replacing this backend with your own (and our dashboard is being deprecated), the sections you
> must implement to be compatible are:
> - **[§13 API Contract](#13-api-contract-build-a-compatible-api)** — exact request/response schemas for every endpoint.
> - **[§14 RBAC specification](#14-rbac-specification)** — the roles and the exact authorization/scoping algorithm.
> - **[§15 Data model & metric definitions](#15-data-model--metric-definitions)** — what every field/metric means.
> - **[§16 Ingestion contract](#16-ingestion-contract-collector--api)** — what the `claudex` collector sends (implement this to keep collecting).
> - **[§17 Minimum viable API checklist](#17-minimum-viable-api-checklist)** — the smallest surface a dashboard needs.
>
> Sections 1–12 describe *our* reference implementation; 13–17 are the **normative contract** — build to those.

---

## Table of contents
1. [What this is](#1-what-this-is)
2. [Repository layout](#2-repository-layout)
3. [End-to-end data flow](#3-end-to-end-data-flow)
4. [Backend API](#4-backend-api)
   - Stack · Project structure · Data model · Auth & RBAC · Endpoint catalog · Config/env · Adding an endpoint
5. [Dashboard](#5-dashboard)
   - Stack · Design system · Auth flow · Data layer · Pages & routing · Charts · Config/env · Adding a page/chart · E2E
6. [Getting started (local dev)](#6-getting-started-local-dev)
7. [Database](#7-database)
8. [Environments](#8-environments)
9. [Deployment](#9-deployment)
10. [RBAC reference](#10-rbac-reference)
11. [Recipes](#11-recipes)
12. [Troubleshooting](#12-troubleshooting)
13. [API Contract (build a compatible API)](#13-api-contract-build-a-compatible-api) ← **normative**
14. [RBAC specification](#14-rbac-specification) ← **normative**
15. [Data model & metric definitions](#15-data-model--metric-definitions) ← **normative**
16. [Ingestion contract (collector → API)](#16-ingestion-contract-collector--api) ← **normative**
17. [Minimum viable API checklist](#17-minimum-viable-api-checklist)

---

## 1. What this is

Team-wide analytics for Claude Code usage. A background collector (the `claudex` CLI) reads each
developer's local session transcripts and POSTs the metrics to the API; the API stores them in
Postgres; the dashboard reads role-scoped aggregates and (for admins) full session content.

Two deployable units live in this repo:

| Unit | Path | What it is |
|---|---|---|
| **Backend API** | `backend-api/` | Fastify REST API on Cloud Run. Ingest + query + RBAC + pool control-plane. |
| **Dashboard** | `dashboard-app/` | Vite/React SPA (static, served from GCS). Consumes the API. |

Supporting: `infra/terraform/` (Cloud SQL, service accounts, secrets, WIF), `bin/claudex` (the CLI +
the hidden analytics collector — read-only over `~/.claude`), and `.github/workflows/` (CI/CD).

---

## 2. Repository layout

```
backend-api/
  src/
    index.js                 # boot: buildServer() + listen
    server.js                # Fastify app: plugins + registers every route module
    config.js                # all env-driven config (single source of truth)
    lib/
      db.js                  # Prisma client singleton + serializeBigInts()
      clients.js             # shared singletons: prisma, Secret Manager, PubSub, googleOAuth
      rbac.js                # roles, resolveActor(), allowedEmails(), assert* guards
      jwt.js                 # member/analytics HS256 tokens (pool + collector)
      members.js             # pool token minting (sole-refresher)
      secrets.js             # Secret Manager custody of refresh tokens + JWT key
      pricing.js             # per-model $/token → session costUsd
      anthropic.js           # Anthropic OAuth refresh + usage
    plugins/
      auth.js                # preHandlers: authUser / authFirebase / authAdmin / authAnalytics / authMember
      errors.js              # typed error envelope
    routes/
      me.js                  # GET /v1/me
      analytics/{query,sessions,enroll,ingest}.js
      control/{pools,members,rollups,joinLinks,admin}.js
      data/{join,token,telemetry}.js
      internal/pollUsage.js
      health.js  openapi.js
  prisma/schema.prisma       # DB schema (source of truth for tables)
  prisma/migrations/         # SQL migrations (prisma migrate)
  openapi/claudex.v1.yaml    # OpenAPI spec (contract test enforces it matches routes)
  scripts/
    dev-local.sh             # run API locally against the DB tunnel
    tunnel.sh                # Cloud SQL proxy tunnel → 127.0.0.1:5432
    seed-analytics.mjs       # seed multi-role test data (UAT)
    cutover.sh               # deploy uat+prod + migrate (manual)
    migrate-firestore.mjs / migrate-prod-data.sh / decommission-legacy.sh   # one-time legacy tooling
  test/                      # unit + contract + integration (node:test)
  Dockerfile                 # distroless build (installs deps → prisma generate → prune)

dashboard-app/
  src/
    main.tsx                 # entry: providers + fonts + tokens.css
    App.tsx                  # role-gated routes + AppShell
    auth.tsx                 # AuthProvider (Google token → role via /v1/me)
    api.ts                   # typed fetchers (Bearer = Google ID token)
    types.ts                 # zod schemas validated at the API boundary
    lib/
      env.ts                 # VITE_* build-time config
      googleAuth.ts          # Google Identity Services (GIS) sign-in
      e2e.ts                 # dev-only auth bypass for Playwright
      chart-theme.tsx        # Atlas teal palette + recharts helpers
      utils.ts  useRange.ts
    styles/tokens.css        # Atlas design tokens (Tailwind v4 @theme)
    components/
      ui/*                   # shadcn-style primitives (Card, Button, Select, DataTable, …)
      layout/*               # AppShell, Sidebar, Topbar, RangeFilter
      charts/*               # KpiTiles, TrendChart, Donut, BarBreakdown, TimeDistribution, …
      AnalyticsSections.tsx  # the full chart stack (shared by Overview + per-user page)
    pages/*                  # Overview, Leaderboard, UserAnalytics, Sessions, SessionThread, Pools, PoolDetail, Admin, SignIn
  tests/e2e/*                # Playwright (per-role, mocked API)
  vite.config.ts  tsconfig.json  playwright.config.ts  .env.example
```

---

## 3. End-to-end data flow

```
 developer's machine                       Cloud Run                     Postgres (Cloud SQL)
 ┌──────────────────┐   POST /v1/analytics/ingest   ┌────────────┐   Prisma   ┌───────────────┐
 │ claudex collector │ ───────(analytics JWT)──────▶ │ backend-api │ ─────────▶ │ Session /      │
 │ (launchd, 10 min) │   incremental session deltas  │  (Fastify)  │            │ Message /      │
 └──────────────────┘                                └─────┬──────┘            │ AnalyticsUser… │
                                                           │                    └───────────────┘
 ┌──────────────────┐   GET /v1/analytics/* (role-scoped)  │  verify Google ID token
 │  dashboard SPA    │ ◀────────(Google ID token)──────────┘  resolve role from Postgres
 │  (Vite/React)     │   summary · activity · breakdown · sessions
 └──────────────────┘
```

- **Ingest** is written by the collector (self-scoped to its own email via an analytics JWT).
- **Query** is read by the dashboard (Google ID token → role → allowed-user scope).
- The **database is the single source of truth**; the API is stateless.

---

## 4. Backend API

### 4.1 Stack
- **Fastify 5** (Node 22, ESM), one service, one process.
- **Prisma** ORM over **PostgreSQL** (Cloud SQL). Connects lazily; `DATABASE_URL` from env/Secret Manager.
- **Cloud Run** runtime (distroless image). Reaches Cloud SQL via the Cloud SQL connector (unix socket) in prod, or the proxy locally.
- Deps: `@fastify/{cors,helmet,rate-limit}`, `@prisma/client`, `google-auth-library`, `@google-cloud/{secret-manager,pubsub}`, `jsonwebtoken`.

### 4.2 Project structure & conventions
- `server.js` builds the Fastify app and **registers every route module**. To add routes you write a module and `app.register` it here.
- Each route module is `export default async function (app) { app.get(...) }`.
- **Errors**: throw `Object.assign(new Error(msg), { statusCode, code })`; `plugins/errors.js` renders a consistent envelope `{ error: { code, message, requestId } }`.
- **BigInt**: token columns are `BigInt` (lifetime cache-read exceeds 2^31). Always pass responses through `serializeBigInts()` (from `lib/clients.js`) so they JSON-encode as numbers.
- **Logging**: Pino → Cloud Logging severities; `authorization`/`cookie` headers are redacted.

### 4.3 Data model (`prisma/schema.prisma`)
Analytics tables (the ones the dashboard reads):

| Model | Key fields | Notes |
|---|---|---|
| `Session` | `id` (Claude session id), `userEmail`, `project`, `gitBranch`, `model`, `startedAt`, `endedAt`, `msgCount`, `inputTokens`/`outputTokens`/`cacheReadTokens`/`cacheCreateTokens` (BigInt), `costUsd` (Float) | one row per Claude Code session; indexed on `userEmail`, `project`, `startedAt` |
| `Message` | `uuid` (PK), `sessionId`, `role`, `seq`, `text?` (@db.Text), `thinking?`, `model?`, `ts?`, `durationMs?`, token ints, `toolNames String[]`, `isSidechain` | prompt/response content — **admin-only via API** |
| `AnalyticsUser` | `email` (PK), `role` (enum admin/pod_lead/member), `orgId?`, `name?` | the RBAC principal; created on enroll or by admin |
| `Pod` | `id` (cuid), `name`, `leadEmail`, `orgId?` | an org sub-team (lead + members) |
| `PodMembership` | `(podId, userEmail)` | pod membership; drives pod_lead scoping |
| `SyncState` | `(userEmail, filePath)`, `byteOffset` | collector's incremental cursor |

Pool control-plane tables (`Org`, `Pool`, `Member`, `JoinLink`, `Rollup`) support the token-pool
feature and are not part of the analytics dashboard.

Change the schema → create a migration (`npm run prisma:migrate:dev`) → it's applied to each env on deploy.

### 4.4 Authentication & RBAC (the important part)

**Identity** — the dashboard sends a **Google ID token** (from GIS) as `Authorization: Bearer <token>`.
`authUser` (in `plugins/auth.js`) verifies it with `google-auth-library` (`aud = GOOGLE_CLIENT_ID`),
requires `email_verified` and an allowed email domain (`ENROLL_DOMAINS`, default `devxlabs.ai`), then
resolves the **role server-side** — never trusting anything the client claims.

**Role resolution** (`lib/rbac.js`):
```
resolveRole(email):
  if email ∈ ADMIN_EMAILS         → 'admin'      # bootstrap admins (env)
  else AnalyticsUser.role         → its value
  else                            → 'member'     # default
```

**preHandlers** (attach `req.actor = { uid, email, role, orgId }` or throw):
| preHandler | Requires | Used by |
|---|---|---|
| `authUser` | any signed-in user | analytics query endpoints |
| `authFirebase` | `admin` **or** `pod_lead` (name is legacy) | pool control-plane writes |
| `authAdmin` | `admin` | sessions content, `/v1/admin/*` |
| `authAnalytics` | valid analytics JWT (self-scoped) | collector `enroll`/`ingest` |
| `authMember` | member HS256 JWT | pool data-plane (CLI proxy) |

**Read scope** — `allowedEmails(actor)` returns whose data the caller may read:
```
admin    → null            # everyone (no filter)
pod_lead → self + members of pods they lead
member   → [self]
```
Every analytics query applies this (`where.userEmail IN (...)`). `assertCanReadSessions` gates session
**content** to admins only. The optional `?user=` param narrows to one user (403 if not in the allowed set).

### 4.5 Endpoint catalog

All under `/v1`. Auth column: **user**=any signed-in, **elevated**=admin+pod_lead, **admin**=admin only,
**analytics**=collector JWT, **member**=pool member JWT.

**Identity & analytics (dashboard)**
| Method · Path | Auth | Purpose |
|---|---|---|
| `GET /me` | user | `{ email, role, orgId }` — the dashboard reads its role here |
| `GET /analytics/summary?days\|from\|to&user?` | user | headline totals + `activeUsers/activeDays/avgDurationMs` |
| `GET /analytics/users?days` | user | per-user leaderboard (role-scoped) |
| `GET /analytics/activity?days&user?` | user | daily series: 4 token buckets + messages + cost |
| `GET /analytics/breakdown?by=model\|project\|tool\|weekday\|hour&days&user?` | user | dimension rollup |
| `GET /analytics/sessions?user&project&model&sort&from&to&limit(≤200)&offset` | **admin** | session list (metadata) |
| `GET /analytics/sessions/:id` | **admin** | full prompt→response thread (content) |

**Admin management**
| `GET /admin/users` · `PUT /admin/users/:email/role` | admin | list users / set role |
| `GET /admin/pods` · `POST /admin/pods` · `POST /admin/pods/:id/members` · `DELETE /admin/pods/:id/members/:email` | admin | pod CRUD |

**Pools (control-plane)** — `GET/POST /pools`, `GET /pools/:id`, `GET /pools/:id/{members,usage,rollups,join-links}`, `POST /pools/:id/join-links`, `DELETE /pools/:id/members/:mid` (elevated).

**Collector & pool data-plane** — `POST /analytics/enroll`, `POST /analytics/ingest`, `GET /analytics/sync-state`, `GET /analytics/whoami` (analytics JWT); `POST /pools/join`, `GET /pools/:id/token`, `POST /telemetry` (pool). `GET /health`, `GET /v1/docs` (Scalar UI), `GET /v1/openapi.json`.

The **OpenAPI spec** (`openapi/claudex.v1.yaml`) is the documented contract; `test/contract.test.js`
fails if a documented path isn't a real route, so keep them in sync.

### 4.6 Config / environment (`config.js`)
Everything is env-overridable with sensible defaults so local `npm start` works.

| Env | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | — (required at query time) | Postgres connection string |
| `GOOGLE_CLIENT_ID` | `''` | OAuth Web Client id used to verify dashboard ID tokens |
| `ADMIN_EMAILS` | `vishal.makwana@devxlabs.ai` | bootstrap admins (comma-sep) |
| `ENROLL_DOMAINS` | `devxlabs.ai` | allowed email domains (sign-in + enroll) |
| `JWT_SECRET` | `…/claudex-jwt-uat/versions/latest` | Secret Manager ref for member/analytics HS256 key |
| `GCP_PROJECT` | `yash-test-495112` | project id |
| `PORT` | `8080` | listen port |
| `DASHBOARD_ORIGIN` | `*` | CORS allowlist (comma-sep or `*`) |
| `USAGE_TOPIC` | `claude-pool-usage` | Pub/Sub topic (pool telemetry) |
| `ENROLL_KEY` | `''` | optional shared enroll key |

### 4.7 Adding an endpoint (pattern)
1. Add a handler in the right `routes/*` module (or a new module registered in `server.js`).
2. Pick a preHandler (`authUser`/`authAdmin`/…) and, for reads, apply `allowedEmails`/`effectiveScope`.
3. `serializeBigInts()` the response.
4. Document it in `openapi/claudex.v1.yaml` (keeps the contract test green).
5. Add an integration test in `test/integration/*` (mocks `google-auth-library` for a fake bearer).

---

## 5. Dashboard

### 5.1 Stack
- **Vite 6 + React 18 + TypeScript**, static SPA (built to `dist/`, `base: './'`, **HashRouter** so
  deep-links work from a GCS bucket subpath).
- **Tailwind v4** (CSS-first tokens, no config file) · **Recharts 3** · **@tanstack/react-query** (data)
  · **@tanstack/react-table** (paginated tables) · **Radix + cva + lucide** (shadcn-style primitives)
  · **zod** (validate API responses) · **Google Identity Services** (auth) · **Poppins** (`@fontsource`).

### 5.2 Design system (Atlas)
- `styles/tokens.css` ports the Atlas palette (teal `#055F59`, an 8-step chart scale, ink ramp, coral
  `#F5585E`) as CSS variables and maps them to Tailwind utilities via `@theme inline`
  (`bg-background`, `text-muted-foreground`, `bg-card`, `bg-sidebar`, `primary`, `ring`, …). Light theme only.
- `lib/chart-theme.tsx` is the recharts kit: `TEAL_SCALE`, `REPORT_COLORS`, `tealSpread(n)`, `AXIS_TICK`,
  `GRID_STROKE`, `<ChartState>`, `<ReportTooltip>`. Axes/grid/tooltip read `var(--…)` so charts auto-theme.
- `components/ui/*` are the primitives (`Card`, `Button`, `Select`, `Dialog`, `Table`, `DataTable`,
  `Badge`, `Segmented`, `Skeleton`). `components/layout/*` is the shell (`AppShell`, `Sidebar`, `Topbar`).

### 5.3 Auth flow
1. `lib/googleAuth.ts` loads GIS (script in `index.html`), renders the Google button (`SignIn.tsx`), and
   on sign-in stores the **Google ID token** (localStorage + in-memory).
2. `api.ts` sends that token as the Bearer on every call.
3. `auth.tsx` decodes the token (email/expiry), enforces the `@devxlabs.ai` domain, and fetches the
   **role from `GET /v1/me`** (server-resolved). Token ~1h; on expiry the user re-signs-in.
4. `isAdmin(role)` / `isElevated(role)` gate the UI; the **server enforces regardless** of the UI.
5. `VITE_E2E=1` swaps all of this for a fake user (role from `?e2e=<role>`) so Playwright never touches Google.

### 5.4 Data layer
- `api.ts` — one `api<T>()` helper (attaches the Bearer, throws typed errors) + a fetcher per endpoint.
- `types.ts` — zod schemas; every response is `.parse()`d so no `any` reaches the UI, and BigInt-as-number
  is coerced.
- `@tanstack/react-query` with `placeholderData: keepPreviousData` (no flicker on filter change). The
  query key encodes the params (e.g. `['breakdown', by, days, user]`), which is also the cache key.

### 5.5 Pages & routing (`App.tsx`)
Role-gated routes inside `AppShell`:

| Route | Visible to | Page |
|---|---|---|
| `/` | all | `Overview` — KPI tiles + trend + breakdowns (via `AnalyticsSections`) |
| `/team` | elevated | `Leaderboard` — paginated users; row → `/users/:email` |
| `/users/:email` | elevated | `UserAnalytics` — one user's full analytics + their sessions |
| `/sessions` | admin | `Sessions` — users list → click → that user's sessions |
| `/sessions/:id` | admin | `SessionThread` — metrics + token-flow-over-time + message thread |
| `/pools`, `/pools/:id` | elevated | `Pools` / `PoolDetail` |
| `/admin` | admin | `Admin` — users & roles + pods |

`AnalyticsSections.tsx` is the shared chart stack; pass `user` to scope it to one person.

### 5.6 Charts
Self-fetching components on top of `ChartCard` + `chart-theme`: `KpiTiles` (14 tiles), `TrendChart`
(stacked tokens / cost / sessions / messages), `Donut` (model), `BarBreakdown` (project/tool),
`TimeDistribution` (hour/weekday), `TopSessionsTable`, `MiniLeaderboard`. Each takes `days` (+ optional
`user`) and runs its own `useQuery`.

### 5.7 Config / environment (`.env.local`, see `.env.example`)
| Env | Meaning |
|---|---|
| `VITE_API_URL` | API base (`http://localhost:8080` locally, or the Cloud Run URL) |
| `VITE_GOOGLE_CLIENT_ID` | GCP OAuth Web Client id (public; shipped in the bundle) |
| `VITE_ALLOWED_DOMAIN` | sign-in domain guard (default `devxlabs.ai`) |
| `VITE_E2E` | `1` only for Playwright |

### 5.8 Adding a page or chart
- **Chart**: create `components/charts/MyChart.tsx` using `ChartCard` + a `useQuery(fetchX)` + recharts
  with `AXIS_TICK`/`GRID_STROKE`/`<ReportTooltip>`. Add a fetcher to `api.ts` + a zod type to `types.ts`.
- **Page**: create `pages/MyPage.tsx`, add a gated `<Route>` in `App.tsx`, and a nav item in
  `components/layout/Sidebar.tsx` (`NAV` array with `adminOnly`/`elevatedOnly`).
- **Table**: use `<DataTable columns={…} data={…} pageSize={15} />` (pagination + sorting are built in).

### 5.9 E2E (Playwright)
`tests/e2e/*` run the dev server with `VITE_E2E=1`, intercept `/v1/*` with per-role fixtures, and assert
nav gating, chart rendering, RBAC routing, and the palette. `npm run test:e2e`.

---

## 6. Getting started (local dev)

**Prerequisites**: `gcloud` (authed to `yash-test-495112`), Node 20+, `cloud-sql-proxy`, `psql`
(`brew install libpq`), and access to the project. Authenticate:
```
gcloud auth login
gcloud auth application-default login
```

**One-time — create the Google OAuth Web Client** (dashboard sign-in):
1. GCP Console → **APIs & Services → OAuth consent screen**: User type **Internal**.
2. **Credentials → Create credentials → OAuth client ID → Web application**.
   - **Authorized JavaScript origins**: `http://localhost:5173` (add the deployed dashboard origin later).
   - Redirect URIs: none (GIS uses the ID-token flow).
   - Copy the **Client ID** → put it in `dashboard-app/.env.local` as `VITE_GOOGLE_CLIENT_ID` and pass it
     to the backend as `GOOGLE_CLIENT_ID` (already defaulted in `dev-local.sh`).

**Run it — three terminals:**
```
# 1) DB tunnel (Cloud SQL proxy → 127.0.0.1:5432)
bash backend-api/scripts/tunnel.sh

# 2) backend API on :8080, against the seeded UAT DB (GOOGLE_CLIENT_ID defaulted in the script)
bash backend-api/scripts/dev-local.sh          # or: dev-local.sh prod  → real prod data

# 3) dashboard on :5173  (VITE_API_URL=http://localhost:8080)
cd dashboard-app && npm install && npm run dev
```
Open http://localhost:5173 → **Continue with Google** (`@devxlabs.ai`). Health check:
`curl http://localhost:8080/v1/health` → `{"ok":true}`.

> Local backend runs as **you** (ADC), which can't do Secret Manager ops — analytics reads work, but the
> pool `join` flow (refresh-token custody) must use the **deployed** API whose service account has SM access.

---

## 7. Database

- **Cloud SQL** instance `yash-test-495112:asia-south1:claudex-db` (Postgres 15), with two databases:
  `claudex_uat` (seeded test data) and `claudex_prod` (real). Per-env users; passwords in Terraform state,
  connection strings in Secret Manager (`claudex-dburl-{uat,prod}`).
- **Migrations** (Prisma): `npm run prisma:migrate:dev` (author, local) / `prisma migrate deploy` (apply).
  The Cloud Run deploy runs `migrate deploy` for the env.
- **Seed** multi-role test data into UAT:
  ```
  DATABASE_URL="postgresql://claudex_uat:<pw>@127.0.0.1:5432/claudex_uat" node backend-api/scripts/seed-analytics.mjs
  ```
  Creates `admin@/lead@/ic1@/ic2@devxlabs.ai`, a Pod, and synthetic sessions so every role view has data.
- **Ad-hoc queries**: with the tunnel up, `psql -h 127.0.0.1 -p 5432 -U claudex_uat -d claudex_uat`.

---

## 8. Environments

| | UAT | Prod |
|---|---|---|
| Branch | `uat` | `main` |
| DB | `claudex_uat` (seeded) | `claudex_prod` (real) |
| Cloud Run | `claudex-api-uat` | `claudex-api-prod` |
| API URL | `https://claudex-api-uat-tvjj3mwixq-el.a.run.app` | `https://claudex-api-prod-tvjj3mwixq-el.a.run.app` |

Point the dashboard at either via `VITE_API_URL`. `dev-local.sh [uat|prod]` selects the local backend's DB.
A `uat`-branch push only touches `-uat`; `main` only `-prod`.

---

## 9. Deployment

**Backend (Cloud Run):**
- **CI (preferred)**: push to `uat`/`main` → `.github/workflows/deploy-api.yml` runs tests, `prisma
  migrate deploy`, and `gcloud run deploy`. Env (incl. `GOOGLE_CLIENT_ID`, `ADMIN_EMAILS`,
  `DASHBOARD_ORIGIN`) comes from GitHub repo **variables**; `DATABASE_URL` is mounted from Secret Manager.
- **Manual**: `bash backend-api/scripts/cutover.sh` (deploys uat+prod, runs migrations). Set
  `GOOGLE_CLIENT_ID=…` in the environment first.
- Image: `backend-api/Dockerfile` (distroless; `prisma generate` at build, `binaryTargets` pinned for the
  runtime). Runtime SA `claudex-api-{env}` has Cloud SQL + Secret Manager access.

**Dashboard (static → GCS):** `cd dashboard-app && npm run build` → upload `dist/` to the hosting bucket.
Set `VITE_*` at build time. Add the deployed origin to the OAuth client's Authorized JS origins.

**Infra**: `infra/terraform/{shared,envs/uat,envs/prod}` (Cloud SQL, SAs, secrets, WIF). `shared` is
admin-managed; CI runs `terraform plan` for env roots on PRs (`tf-plan.yml`).

---

## 10. RBAC reference

| Capability | admin | pod_lead | member |
|---|---|---|---|
| Own metrics (Overview) | ✓ (all) | ✓ (pod) | ✓ (self) |
| Others' metrics | all | their pod | ✗ |
| Leaderboard `/team` | ✓ | ✓ (pod) | ✗ |
| Per-user analytics `/users/:email` | ✓ | ✓ (pod members) | ✗ |
| **Session content** `/sessions*` | ✓ | ✗ | ✗ |
| Pools | ✓ | ✓ | ✗ |
| Manage users/roles/pods `/admin` | ✓ | ✗ | ✗ |

Enforced server-side by `allowedEmails` + `assert*` guards; the UI mirrors it but is not the gate.

---

## 11. Recipes

- **Make someone admin**: add their email to `ADMIN_EMAILS` (bootstrap, needs redeploy/restart), or set
  their role on the dashboard **`/admin`** page (persists in Postgres).
- **Add a metric to a chart**: extend the query handler's `_sum`/select + the zod type + the chart.
- **New analytics dimension**: add a `by=` branch in `routes/analytics/query.js` breakdown handler
  (reuse `effectiveScope`) + a `<BarBreakdown by="…">`/`<Donut by="…">` on a page.
- **Run backend tests**: `cd backend-api && npm test` (unit+contract); with the tunnel up,
  `DATABASE_URL=… npm run test:integration`.
- **Reset local UAT data**: re-run `seed-analytics.mjs` (idempotent).

---

## 12. Troubleshooting

| Symptom | Cause → Fix |
|---|---|
| Dashboard blank, console `auth/invalid-api-key` (legacy) or `Configuration needed` | `VITE_GOOGLE_CLIENT_ID` unset → set it in `.env.local`, restart `npm run dev`. |
| Google popup: **"no registered origin" / 401 invalid_client** | The dashboard origin isn't in the OAuth client → add `http://localhost:5173` to **Authorized JavaScript origins**, wait ~1–2 min. |
| API 500 `Can't reach database server at 127.0.0.1:5432` | Tunnel down → run `bash backend-api/scripts/tunnel.sh`. |
| `terraform ... invalid_grant (invalid_rapt)` | gcloud session needs reauth → `gcloud auth login && gcloud auth application-default login`. |
| Sign-in works but everything 401s | Backend has no/incorrect `GOOGLE_CLIENT_ID` (must equal the client that minted the token), or wrong email domain. |
| `querystring/limit must be <= 200` | Requesting too many sessions → client caps at 200; use pagination/`offset`. |
| Pool `join was rejected: invalid_link` | The CLI hit a different env than where the link was created → point `CLAUDEX_API` at the same env (the deployed one, so its SA can do Secret Manager). |
| `Rendered fewer hooks than expected` | A hook after a conditional `return` → move all hooks above returns (or split into child components). |

---

# NORMATIVE CONTRACT

Everything below is what a **replacement API must implement** to be compatible with a dashboard (ours or
yours). Field names and types are exact.

## 13. API Contract (build a compatible API)

### 13.0 Conventions
- **Base path** `/v1`; JSON request/response; UTF-8.
- **Auth header** `Authorization: Bearer <token>` — a **Google ID token** for dashboard endpoints; an
  **analytics token** (opaque, issued by your `/enroll`) for collector endpoints.
- **Numbers** — token counts are returned as JSON **numbers** (serialize any 64-bit ints → number). Costs
  are floats (USD).
- **Dates** — ISO-8601 UTC strings in responses. Range params: `days` (int 1–365, default **30**) **or**
  explicit `from`/`to` (ISO). The window is `[from, to)` applied to `Session.startedAt`.
- **Error envelope** for every non-2xx:
  ```json
  { "error": { "code": "forbidden", "message": "human text", "requestId": "abc123", "details": {} } }
  ```
  Codes → status: `invalid_request` 400, `unauthenticated` 401, `forbidden` 403, `not_found` 404,
  `rate_limited` 429, else 500.
- **CORS** — allow the dashboard origin(s); headers `Authorization`, `Content-Type`; methods
  `GET, POST, PUT, DELETE, OPTIONS`.

### 13.1 Dashboard auth — verification steps
1. Read the Bearer token.
2. Verify it is a valid **Google ID token**: signature (Google certs), `aud == GOOGLE_CLIENT_ID`,
   `iss ∈ {accounts.google.com, https://accounts.google.com}`, unexpired, `email_verified !== false`.
3. Enforce `email` domain ∈ allowed domains (e.g. `devxlabs.ai`) → else **403**.
4. Resolve the **role** for `email` server-side (see §14) → attach actor `{ email, role, orgId }`.
5. Bad/absent token → **401**; wrong domain/role → **403**. Never trust a client-supplied role.

### 13.2 Endpoint reference (request → response)

Auth levels: **user** = any signed-in; **elevated** = admin|pod_lead; **admin** = admin only.
All list/aggregate responses are **role-scoped** by the actor's allowed-user set (§14).

---
**`GET /v1/me`** · user
Response:
```json
{ "email": "ada@devxlabs.ai", "role": "admin", "orgId": null }
```
`role ∈ {"admin","pod_lead","member"}`. The dashboard uses this to decide which views to show.

---
**`GET /v1/analytics/summary`** · user · query: `days|from|to`, optional `user`
```json
{
  "scope": "admin",
  "from": "2026-06-14T…Z", "to": "2026-07-14T…Z",
  "totals": {
    "sessions": 85, "messages": 64969,
    "inputTokens": 26885115, "outputTokens": 66274514,
    "cacheReadTokens": 17770881420, "cacheCreateTokens": 290796252,
    "costUsd": 36673.32,
    "activeUsers": 4, "activeDays": 41, "avgDurationMs": 2520000
  }
}
```

---
**`GET /v1/analytics/users`** · user · query: `days|from|to` — the leaderboard, **sorted by `costUsd` desc**
```json
{ "scope": "admin", "users": [
  { "email": "ada@devxlabs.ai", "name": "Ada", "role": "admin",
    "sessions": 20, "messages": 1500,
    "inputTokens": 600000, "outputTokens": 400000,
    "cacheReadTokens": 20000000, "cacheCreateTokens": 1500000, "costUsd": 400.0 }
] }
```

---
**`GET /v1/analytics/activity`** · user · query: `days|from|to`, optional `user` — one row per day, ascending
```json
{ "scope": "admin", "activity": [
  { "date": "2026-07-01", "sessions": 3, "messages": 120,
    "inputTokens": 80000, "outputTokens": 60000,
    "cacheReadTokens": 3000000, "cacheCreateTokens": 200000, "costUsd": 40.0 }
] }
```

---
**`GET /v1/analytics/breakdown`** · user · query: **`by` (required)** ∈ `model|project|tool|weekday|hour`, `days|from|to`, optional `user`
```json
{ "scope": "admin", "by": "model", "items": [ /* shape depends on `by` */ ] }
```
Item shapes:
- `by=model` / `by=project` → sorted by `costUsd` desc:
  ```json
  { "key": "claude-opus-4-8", "sessions": 30, "messages": 900,
    "inputTokens": 900000, "outputTokens": 700000,
    "cacheReadTokens": 30000000, "cacheCreateTokens": 2000000, "costUsd": 600.0 }
  ```
  (`key` is the model name / project path; use `"(unknown)"` for null.)
- `by=tool` → sorted by `count` desc: `{ "key": "Bash", "count": 320 }` (count of `tool_use` occurrences).
- `by=weekday` → `{ "key": 0, "sessions": 7, "messages": 100, "tokens": 1234, "costUsd": 20.0 }` where `key` is `0=Sun … 6=Sat`.
- `by=hour` → same shape, `key` is `0…23` (hour of `startedAt`).

---
**`GET /v1/analytics/sessions`** · **admin** · query: `user, project, model, sort(recent|cost|tokens|duration|msgs), from, to, limit(≤200,def 50), offset(def 0)`
```json
{ "total": 85, "sessions": [
  { "id": "d7fc…", "userEmail": "ic1@devxlabs.ai", "project": "/work/x", "gitBranch": "main",
    "model": "claude-opus-4-8", "startedAt": "…Z", "endedAt": "…Z", "msgCount": 42,
    "inputTokens": 50000, "outputTokens": 40000, "cacheReadTokens": 2000000,
    "cacheCreateTokens": 150000, "costUsd": 30.0 }
] }
```
`total` is the unpaginated count (for the pager). Metadata only — no message text here.

---
**`GET /v1/analytics/sessions/:id`** · **admin** — full thread (content); 404 if not found
```json
{ "session": { /* same shape as a sessions[] item */ },
  "messages": [
    { "uuid": "m1", "role": "user", "seq": 0, "text": "…", "thinking": null,
      "model": null, "ts": "…Z", "durationMs": null,
      "inputTokens": 0, "outputTokens": 0, "cacheReadTokens": 0, "cacheCreateTokens": 0,
      "toolNames": [], "isSidechain": false }
  ] }
```
Messages ordered by `(seq asc, ts asc)`. `text`/`thinking` are the raw prompt/response — **admin-only**.

---
**Admin management** (all · **admin**)
- `GET /v1/admin/users` → `{ "users": [ { "email", "role", "name", "orgId", "createdAt" } ] }`
- `PUT /v1/admin/users/:email/role` body `{ "role": "pod_lead" }` → `{ "email", "role", "name", "orgId" }`
- `GET /v1/admin/pods` → `{ "pods": [ { "id", "name", "leadEmail", "orgId", "members": ["ic1@…"] } ] }`
- `POST /v1/admin/pods` body `{ "name", "leadEmail", "orgId"? }` → **201** `{ "id","name","leadEmail","orgId","createdAt" }`
- `POST /v1/admin/pods/:id/members` body `{ "email" }` → **201** `{ "podId", "userEmail" }`
- `DELETE /v1/admin/pods/:id/members/:email` → `{ "podId", "userEmail", "removed": true }`

---
## 14. RBAC specification

### 14.1 Roles
```
admin     — sees everyone's metrics AND session content; manages users/roles/pods.
pod_lead  — sees their pod's members' metrics; creates pools; NO session content.
member    — sees only their own metrics; NO session content, NO management.
```
Stored per user (`AnalyticsUser.role`, default `member`). **Bootstrap admins**: a configured list of
emails (`ADMIN_EMAILS`) that are always `admin` regardless of the stored row — this solves the
chicken-and-egg of granting the first role.

### 14.2 Role resolution (server-side, authoritative)
```
resolveRole(email):
  if email ∈ ADMIN_EMAILS:            return "admin"
  row = store.getUser(email)
  return row ? row.role : "member"
```

### 14.3 Read scope — `allowedEmails(actor)`
Defines whose rows the actor may read; applied as `WHERE userEmail IN (allowed)` on every aggregate/list:
```
allowedEmails(actor):
  if actor.role == "admin":     return null                 # no restriction → everyone
  if actor.role == "pod_lead":  return { actor.email } ∪ { members of every pod actor leads }
  else (member):                return { actor.email }
```
The optional **`?user=<email>`** param narrows a query to one user, but **only if that email is in the
allowed set** — otherwise **403**. (This powers the per-user drill-down.)

### 14.4 Per-endpoint authorization
| Endpoint(s) | Required | Extra scoping |
|---|---|---|
| `GET /me` | any signed-in | — |
| `GET /analytics/{summary,users,activity,breakdown}` | any signed-in | rows filtered by `allowedEmails`; `?user` must be allowed |
| `GET /analytics/sessions`, `GET /analytics/sessions/:id` | **admin only** | session content is admin-only (hard gate) |
| `GET/PUT /admin/*` | **admin only** | — |
| `POST /pools*`, pool writes | admin **or** pod_lead | pod_lead confined to own org |

### 14.5 Invariants (must hold)
- Role is **always** derived server-side from identity; a client-sent role is ignored.
- A `member` can never retrieve another user's rows (aggregate or session).
- Session **content** (`text`/`thinking`) is returned by **admin only**. (A future relaxation could allow a
  user to read *their own* content, but the reference contract keeps it admin-only.)
- All list endpoints return only rows within `allowedEmails`.

---
## 15. Data model & metric definitions

### 15.1 Core entities
- **Session** — one Claude Code session. Fields: `id`, `userEmail`, `project` (cwd path), `gitBranch`,
  `model` (dominant model), `startedAt`/`endedAt` (first/last message ts), `msgCount`, token totals
  (`inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheCreateTokens`), `costUsd`.
- **Message** — one turn. `uuid` (globally unique, dedup key), `sessionId`, `role` (`user|assistant`),
  `seq`, `text?`, `thinking?`, `model?`, `ts?`, `durationMs?`, per-message token ints, `toolNames[]`
  (names of `tool_use` calls), `isSidechain`.
- **AnalyticsUser** — `email` (PK), `role`, `name?`, `orgId?`.
- **Pod** / **PodMembership** — `Pod{ id, name, leadEmail, orgId? }`, membership `(podId, userEmail)`.

### 15.2 Derived metrics (how the dashboard computes/expects them)
| Metric | Definition |
|---|---|
| total tokens | `input + output + cacheRead + cacheCreate` |
| cache-read ratio | `cacheReadTokens / totalTokens` |
| avg tokens/session | `totalTokens / sessions` |
| avg messages/session | `messages / sessions` |
| `avgDurationMs` | mean of `(endedAt − startedAt)` over sessions with both timestamps |
| `activeUsers` | distinct `userEmail` in range (admin scope) |
| `activeDays` | distinct `date_trunc('day', startedAt)` in range |
| `costUsd` (per session) | Σ over messages of `costFor(model, tokenBucket)` |

**Cost model** (`costFor`, USD per **1M** tokens; adjust to your pricing):
| family | input | output | cache-read | cache-write |
|---|---|---|---|---|
| opus (`*opus*`) | 15 | 75 | 1.5 | 18.75 |
| sonnet (`*sonnet*`, default) | 3 | 15 | 0.30 | 3.75 |
| haiku (`*haiku*`) | 0.80 | 4 | 0.08 | 1.0 |
Cost is a **list-price-equivalent** estimate, not billed spend.

### 15.3 Dimension semantics (breakdown)
- `model`, `project` — group Sessions by that column.
- `tool` — count occurrences across `Message.toolNames` (unnest the array; each element is one use).
- `weekday` — `EXTRACT(DOW FROM startedAt)` → `0=Sun…6=Sat`.
- `hour` — `EXTRACT(HOUR FROM startedAt)` → `0…23`.

---
## 16. Ingestion contract (collector → API)

The `claudex` CLI runs a background collector (launchd, every 10 min) that reads each developer's
`~/.claude/projects/**/*.jsonl` **read-only**, parses **user prompts + assistant text/thinking + usage
+ tools** (excludes images, tool_result payloads, attachments, empty turns), and POSTs **only new bytes**
(per-file byte-offset). **Implement these to keep collecting** with the existing CLI:

**`POST /v1/analytics/enroll`** — no bearer; optional `x-enroll-key: <shared key>` header; body:
```json
{ "email": "dev@devxlabs.ai", "name": "dev" }
```
Enforce email domain. Response `{ "email", "token": "<opaque analytics token>" }`. The collector **caches
and echoes** this token as the Bearer on subsequent calls — **the token format is yours** (JWT, opaque,
whatever your `/ingest` can verify). Bind the token to the email so ingest is self-scoped.

**`POST /v1/analytics/ingest`** — Bearer = the analytics token; `userEmail` is taken from the **token**
(never the body). Body (any part may be empty):
```json
{
  "sessions": [ { "id", "project", "gitBranch", "model" } ],
  "messages": [ { "uuid", "sessionId", "role", "seq", "text?", "thinking?", "model?", "ts?",
                  "inputTokens", "outputTokens", "cacheReadTokens", "cacheCreateTokens",
                  "toolNames": [], "isSidechain" } ],
  "syncState": [ { "filePath", "byteOffset", "mtime?" } ]
}
```
Rules: **idempotent** — dedup messages by `uuid` (re-sends are no-ops); **self-scoped** — only accept
sessions owned by the token's email (never let one user write another's session); after upserting,
**recompute** each touched Session's rollups (counts, token sums, `costUsd`, `startedAt`/`endedAt`) from
its messages; persist `syncState` per file. Response:
```json
{ "ok": true, "sessions": 1, "messagesReceived": 20, "messagesInserted": 18, "touchedSessions": 1 }
```

**`GET /v1/analytics/sync-state`** · analytics token → `{ "syncState": [ { "filePath", "byteOffset", "mtime" } ] }`
(the collector uses local state primarily; this is a resume backup).
**`GET /v1/analytics/whoami`** · analytics token → `{ "email" }`.

> The collector's API base is `CLAUDEX_API` (compiled default → prod; overridable via env). Point it at
> your API and it will enroll + ingest against you. If you replace the collector too, this section is moot.

---
## 17. Minimum viable API checklist

To back **a read-only analytics dashboard**, implement (with §13.1 auth + §14 RBAC):
- [ ] `GET /v1/me`
- [ ] `GET /v1/analytics/summary`
- [ ] `GET /v1/analytics/activity`
- [ ] `GET /v1/analytics/users`
- [ ] `GET /v1/analytics/breakdown` (at least `model`, `project`)
- [ ] `GET /v1/analytics/sessions` + `GET /v1/analytics/sessions/:id` (admin) — only if you surface sessions
- [ ] the error envelope, CORS, and BigInt→number conventions (§13.0)

Add on demand: `/v1/admin/*` (only if the dashboard manages roles/pods), the **ingestion** endpoints
(§16, only if reusing the `claudex` collector), and the pool control/data-plane (unrelated to analytics).

**Data you need to store** to serve the above: `Session` + `Message` (+ their token/cost fields) and an
`AnalyticsUser`(email→role) table, plus `Pod`/`PodMembership` if you support `pod_lead` scoping.

---

*Sections 1–12 = our reference implementation; 13–17 = the contract to build against. The running code is
the ultimate source of truth — `backend-api/src/server.js`, `routes/analytics/*`, `lib/rbac.js`, and
`dashboard-app/src/{api.ts,types.ts}`.*
