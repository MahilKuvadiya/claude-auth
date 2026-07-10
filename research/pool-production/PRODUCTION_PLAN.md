# claudex → Production — phased plan

Current state: GCP infra provisioned; 3 Cloud Functions deployed (ACTIVE, untested);
landing + console hosted on the bucket but **mock, public, no auth**; CLI still on Pantry.
This plan closes the gap to a real pilot, then to production.

Legend: 🟢 no GCP write · 🟡 GCP write (approval/self-run) · 🔵 needs a console step.

## Phase 1 — Wire the client to the backend  *(make it real)*
- **1a** 🟡 Function invocation: allow app-JWT-gated calls (add invoker) so the CLI can reach the functions.
- **1b** 🟢 CLI swap in `bin/claude-auth`: backend config; `claudex pool join <token>` → `/pool/join`; `pool serve` fetches access tokens from `/pool/token` (drop local refresh in backend mode); telemetry batch → `/telemetry`; `pool leave` → revoke.
- **Exit:** `claudex pool join <real link>` succeeds and a pooled request is served.

## Phase 2 — End-to-end verification  *(prove it, not mock)*
- **2a** 🟢 Seed a test org + pool + one targeted join link (Firestore).
- **2b** 🟢 Real join with an account; serve a real Claude request through the pooled token; exercise 401-refresh + 429-failover.
- **2c** 🟢 Confirm telemetry lands in Firestore rollups (and Pub/Sub).
- **Exit:** one real pooled request, measured — no mock.

## Phase 3 — Console on real data + auth
- **3a** 🔵 Firebase Auth: Google provider, domain-locked to `devxlabs.ai`; set `org_admin`/`pod_lead` custom claims.
- **3b** 🟢 Wire console reads to Firestore (rollups, members); create-pool + join-link via admin endpoints.
- **3c** 🟡 Deploy `firestore.rules`; take the dashboard **off public** (serve behind auth).
- **Exit:** console shows live data, admin-only.

## Phase 4 — Analytics pipeline
- **4a** 🟡 Pub/Sub → BigQuery consumer (BQ push subscription) so events land in `usage_events`.
- **4b** 🟡 Rate-limit headroom poller: Cloud Scheduler + a function hitting Anthropic's usage endpoint per member → Firestore.
- **4c** 🟢 Historical charts in the console sourced from BigQuery.
- **Exit:** real trends + real headroom, not hardcoded.

## Phase 5 — Hardening & ops
- Structured logging, retries, input validation on all endpoints.
- Cloud Monitoring dashboards + alerts: token-refresh failure rate, per-pool 429 spikes, telemetry ingest lag.
- Secret rotation policy; least-privilege review; load/failure testing.
- Custom domain + HTTPS load balancer + Cloud CDN for the dashboard.
- **Exit:** observable, resilient, on a real domain.

## Phase 6 — Compliance & rollout
- Resolve the ToS stance (subscription-pooling vs the API-key mode seam); document it.
- Admin runbook; pilot with one POD; then wider rollout.
- **Exit:** signed off; first POD live on production.

## Function-auth decision (Phase 1a)
Pilot: make functions publicly invocable but **app-JWT-gated** (`/pool/token` + `/telemetry` require a valid member JWT; `/pool/join` requires a valid single-use join token). Production hardening (Phase 5): front with API Gateway / rate limiting, or move to IAM-authenticated invocation with per-client identity.
