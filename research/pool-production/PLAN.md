# Pool → Production (GCP) — Plan

**Status:** approved 2026-07-10. Scope is deliberately small: keep the current pool, swap Pantry for professional GCP token management, add targeted join links, and build an admin-only data-rich dashboard (Apple "Liquid Glass" design).

## Non-goals / what stays unchanged
- The local forwarder stays as-is: `_Pool` + `PoolHandler`, failover/balance, per-request bearer swap, 429-failover / 401-refresh-retry, streaming relay, four-token metering (identity-encoding fix). **Traffic to Anthropic stays on each dev's machine.**
- No user-side SSO/CLI login (`login-org` is dropped). The join link is the auth.

## The three changes
1. **Token store: Pantry → GCP.** A backend (Cloud Run) + Firestore (metadata) + Secret Manager (refresh tokens). `pool serve` gets a short-lived access token from `GET /pool/token` instead of decrypting a Pantry blob. **Backend is the sole refresher** (serialized per account) → fixes the single-use-refresh-token collisions observed in the current design (`pool.log: token rejected`).
2. **Targeted, single-use join links.** Admin generates `claude-auth pool join <token>` bound to ONE email. Join only completes if the credential contributed on that machine matches the target email. Single-use + expiring.
3. **Admin-only dashboard.** Regular users never see it. Admin auth is dashboard-only (Google SSO locked to the org domain); it never touches the CLI.

## Tenancy
Org → Pool (a Pool ≈ a POD) → Member. Roles: `org_admin`, `pod_lead`, `member`. An org can have many pools.

## Token custody model
- Refresh tokens: **Secret Manager** (CMEK), never handed to clients.
- Access tokens: minted/refreshed by the backend, cached, handed to authorized member proxies with short TTL via `/pool/token`.
- Revoke: destroy the secret + set member `status=revoked` → proxies stop getting tokens (real enforcement, unlike the Pantry "trust = link").

## Data model (Firestore + Secret Manager + BigQuery)
```
orgs/{orgId}                         { name, domain, admins[] }
pools/{poolId}                       { orgId, name, mode, createdBy, status }
pools/{poolId}/members/{memberId}    { email, accountUuid, secretRef, role, status,
                                       rateLimit:{fiveHourPct, weeklyPct, refreshedAt}, joinedAt, lastServedAt }
pools/{poolId}/rollups/{period}      { tokensIn, tokensOut, cacheRead, cacheWrite, requests, byMember{…} }
joinLinks/{token}                    { poolId, targetEmail, expiresAt, usedAt }
Secret Manager: refresh tokens (per member, CMEK)
BigQuery: usage_events(ts, org, pool, member, in, out, cache_read, cache_write, requests, model, status, latency)
```

## Telemetry & analytics
`pool serve` batches per-request events → `POST /telemetry` → Pub/Sub → BigQuery; a function maintains Firestore rollups for instant dashboard reads. A scheduled poller hits Anthropic's usage endpoint per member for 5h/weekly headroom.

## Dashboard (the deliverable)
Stack: Next.js (App Router), Firebase Hosting + CDN, Firestore realtime for live tiles, BigQuery for historical charts, visx/Recharts, Tailwind + custom liquid-glass primitives, Framer Motion.

Pages: Org overview · Pool detail · Member drill-down · Create pool & manage members (targeted-link generation) · Settings/audit.

Metrics: org KPIs (tokens in/out/cache, cost-equivalent $, requests, active members) · stacked-area token trends · contributed-vs-consumed fairness bars · cache-efficiency gauge · per-member rate-limit headroom meters · failover/429 timeline · latency p50/p95 · hour×day heatmap · model split · leaderboards · realtime pool pulse · member table with actions (regenerate link, revoke, promote).

Liquid-glass design: translucent material (`backdrop-filter` blur+saturate, oklch tint, specular edge), depth layering, light/dark, spring motion (reduced-motion aware). **Guardrails:** solid surfaces behind charts/tables/text; WCAG AA over worst-case backdrop; accessible categorical palette; color never the only signal. Build as `<GlassPanel> <GlassCard> <GlassNav> <StatTile> <Meter> <GlassModal>` primitives. (Pull `artifact-design` + `dataviz` skills at build time.)

## Roadmap
1. Backend swap: `/pool/join` (targeted-link verify), `/pool/token` (server-side refresh+mint), Secret Manager, Firestore; CLI swaps Pantry source → backend + targeted `pool join <token>`.
2. Telemetry: `/telemetry` → BigQuery + Firestore rollups; usage poller.
3. Dashboard: glass primitives + Org overview + Pool detail + create/manage + core charts.
4. Depth: cost-equiv, heatmaps, failover timeline, audit, revoke/roles.

## Working agreement
GCP: reads free; **every write is approval-gated** — the specific resource list is presented before execution.
