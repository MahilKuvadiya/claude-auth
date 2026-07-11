# Phase 1 — Backend swap: engineering spec

Goal: replace the Pantry blob with a GCP backend, keep the local proxy otherwise unchanged, and make joins targeted + single-use.

## API contract (Cloud Run, HTTPS)

All member-facing endpoints authenticate with the **member client-credential** issued at join (a signed JWT stored locally in `pool-remote.json`), except `/pool/join` which authenticates with the **join token**.

### POST /pool/join
Contribute the caller's account to a pool via a targeted link.
```
req  { joinToken, email, accountUuid, refreshToken }        // sent once, over TLS
      // email/accountUuid read from local ~/.claude.json oauthAccount
server:
  - look up joinLinks/{joinToken}; reject if missing / used / expired
  - reject if email != joinLinks.targetEmail                 // <-- targeting enforced here
  - (optional hardening) mint an access token from refreshToken to confirm it is live;
    record the accountUuid it resolves to and lock the member to it
  - store refreshToken in Secret Manager (secretRef); create pools/{poolId}/members/{memberId}
  - mark joinLinks.usedAt; write audit
resp { memberId, poolId, backendUrl, memberToken }           // memberToken = client-credential JWT
```

### GET /pool/token?pool={poolId}   (auth: memberToken)
Return a usable short-lived access token for the account this member is set to serve from.
```
server:
  - resolve selected account for this pool (default: the member's own contributed account)
  - if cached access token still valid (>60s) -> return it
  - else refresh under a per-account lock (Firestore txn), re-seal rotated refresh token, cache
resp { accessToken, expiresAt, servingMemberId }
```

### POST /telemetry   (auth: memberToken)
Batch of per-request usage events from the proxy.
```
req  { events: [ { ts, servingMemberId, model, status, latencyMs,
                   inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens } ] }
server: publish to Pub/Sub -> BigQuery; increment Firestore rollups
```

### Admin (dashboard only; auth: Firebase ID token, org_admin/pod_lead)
```
POST /admin/pools                 create pool
POST /admin/pools/{id}/join-links { targetEmail } -> { joinToken, command, expiresAt }
POST /admin/members/{id}/revoke   destroy secret, status=revoked
GET  /admin/... (reads served from Firestore/BigQuery by the dashboard directly where possible)
```

## Firestore security rules (sketch)
- `orgs`, `pools`, `pools/*/members`, `joinLinks`: **no client access**; all writes via Cloud Run with a service account. Dashboard reads gated by Firebase Auth custom claims (`org_admin` sees org; `pod_lead` sees their pools).
- Rollups readable by authorized admins only. Secrets never in Firestore (only `secretRef`).

## Secret Manager layout
- One secret per member: `pool-{poolId}-member-{memberId}` holding the refresh token, CMEK via Cloud KMS.
- Cloud Run SA granted `secretmanager.secretAccessor` + `secretVersionAdder` (for rotation) scoped to these.

## CLI change (bin/claude-auth) — smallest possible diff
Swap the *token source* only; the forwarder is untouched.
- **`PoolStore` (Pantry) → `BackendStore`**: `load()`-equivalent becomes `GET /pool/token`; `save()` of rotated tokens is **removed** from the client (backend owns refresh). Usage flush → `POST /telemetry`.
- **`_Pool._reload_remote`**: build the (single selected) account from the backend response instead of the decrypted blob. Local `token_for` no longer refreshes/persists refresh tokens — it just fetches/caches the backend-minted access token.
- **`cmd_pool_join`**: accept a targeted `<joinToken>`; read local `oauthAccount` (email, accountUuid) + refresh token; `POST /pool/join`; write `pool-remote.json` = `{ backendUrl, poolId, memberId, memberToken }` (no Pantry id/key).
- **`cmd_pool_leave` / revoke**: call backend; backend destroys the secret.
- Everything else (`pool serve`, `pool use`, `pool members`, `pool usage`, failover, metering) unchanged; `pool members`/`usage` now read from the backend.

## GCP write operations Phase-1 needs (ALL approval-gated)
1. Enable APIs: Firestore, Secret Manager, Cloud KMS, Cloud Run, Pub/Sub, BigQuery, Firebase Auth, Firebase Hosting, Cloud Build, IAM.
2. Create Firestore (native mode) + composite indexes.
3. Create KMS keyring/key; create Cloud Run service + a dedicated service account with least-privilege IAM.
4. Create BigQuery dataset + `usage_events` table (day-partitioned); Pub/Sub topic + subscription.
5. Firebase Auth: enable Google provider, restrict to the org domain; Firebase Hosting site for the dashboard.
6. Secrets are created per-join at runtime (not upfront).

## How to hand over GCP access
When ready: `! gcloud auth login` (and `! gcloud config set project <PROJECT_ID>`) in this session, then tell me the project id. I'll start with **read-only** inspection (enabled APIs, existing Firestore/IAM/billing) and present the exact write list above for approval before creating anything.
