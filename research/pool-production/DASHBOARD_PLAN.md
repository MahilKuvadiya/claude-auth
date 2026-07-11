# claudex admin console — production React app plan

The static HTML in `dashboard/` is **design reference only** (locks the liquid-glass
look). The production console is a real React app: typed, authenticated, wired to
live Firestore/Functions, with **no mock data anywhere** — real data or explicit
loading/empty/error states.

## Stack
- **React 18 + TypeScript + Vite** (fast build, static output → the existing GCS bucket).
- **Firebase JS SDK**: Auth (Google, domain-locked to `devxlabs.ai`) + Firestore (realtime reads).
- **TanStack Query** for server state (admin endpoint calls: caching, retries, loading/error).
- **React Router** (Overview / Pool / Members / Settings).
- **Tailwind** + a hand-built **liquid-glass component library** (`<GlassPanel/> <GlassCard/> <StatTile/> <Meter/> <GlassModal/> <GlassNav/>`), ported from the HTML tokens — light/dark, reduced-motion, WCAG-AA over blur.
- **Recharts** (or visx) for charts, on solid surfaces.
- **Zod** to validate every API/Firestore payload at the boundary (no `any`).

## No dummy data — ever
- Every screen sources from Firestore/Functions. Empty org → a real **empty state** ("Create your first pool"), not fake tiles.
- Loading → skeletons; error → typed error surface with retry. A number renders only when it's real.
- The old bucket HTML is replaced by the built app; nothing mock ships.

## Auth & access
- Google sign-in restricted to the org domain; **org-admin only** (custom claim `role=org_admin`, `orgId`). Non-admins are bounced.
- Claims set by an admin bootstrap (one-time script / `setCustomClaims` callable). Firestore rules already gate reads to admins; **all privileged writes go through authenticated admin Functions** (dashboard never holds SA creds).

## Backend — admin endpoints to add (authenticated by Firebase ID token + admin claim)
Current functions are member-facing (`poolJoin`/`poolToken`/`telemetry`). Add an `admin` function group:
- `POST /admin/pools` — create a pool (name, mode).
- **`POST /admin/pools/:id/join-links` — generate a targeted join link ANYTIME** (not just at creation). Body `{ email }` → `{ joinToken, command, expiresAt }`. This is the "add another member after the pool exists" flow, first-class.
- `GET  /admin/pools/:id/join-links` — list pending/used links (revoke / regenerate).
- `POST /admin/members/:id/revoke` — destroy secret + mark revoked.
- `GET` reads (pools, members, rollups) served **directly from Firestore** via the client SDK under security rules (cheaper, realtime) — endpoints only for writes/secrets.

## Screens (all live data)
1. **Overview** — org KPIs (tokens in/out/cache, requests, active seats, cost-equivalent), org usage trend, pool cards → real Firestore rollups. Empty state when no pools.
2. **Create pool** — name + mode → `POST /admin/pools`; then invite members (generate links).
3. **Pool detail** — live pulse (realtime), token breakdown, contributed-vs-consumed, cache efficiency, per-member headroom, **members table with "Generate join link", "Regenerate", "Revoke"** (add members anytime).
4. **Members / invites** — pending links (with the copyable `claudex pool join <token>` command), used links, revoked seats.
5. **Settings** — admins, domain, audit log.

## Analytics sources
- Realtime tiles/tables ← Firestore rollups (cheap, live).
- Historical/deep charts ← BigQuery (via a thin read endpoint or scheduled export to Firestore) — added in Phase 4.
- Rate-limit headroom ← the scheduled usage-poller (Phase 4) writing `member.rateLimit`.

## Build & deploy
- `dashboard-app/` (new). `npm run build` → static assets → GCS bucket (same one), **behind auth** (no public data; the app shell can be public, data requires sign-in). Custom domain + HTTPS LB in Phase 5.
- Env: Firebase config + the deployed Function URLs via Vite env vars.

## Phased build
- **D1** — scaffold Vite+TS+Tailwind+Firebase; auth gate (Google, domain-locked); app shell + glass component library ported from the HTML; empty/loading/error primitives.
- **D2** — admin Functions (create pool, generate/list join-links, revoke) + Firestore rules deploy + admin-claim bootstrap.
- **D3** — Overview + Create-pool + Pool-detail wired to **live** Firestore; members table with anytime-link-generation.
- **D4** — charts (realtime rollups), invites/settings, polish; replace the bucket HTML with the built app.

## Open decisions
1. Confirm stack (React+Vite+TS+Tailwind+Firebase+TanStack+Recharts) or house preference.
2. Admin-claim bootstrap: seed the first `org_admin` via a one-time script — which email(s)?
3. Keep the two static HTML files as `dashboard/reference/` (design source), or delete once the app lands.
