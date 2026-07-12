---
title: API overview
description: The unified REST API behind pooling and the dashboard.
sidebar:
  order: 1
---

The backend pool + dashboard are powered by one **unified, versioned REST API** (`/v1`) on Cloud
Run. Two planes share the service:

- **Control plane** — authenticated by a Firebase ID token with an `org_admin`/`pod_lead` claim.
  Used by the dashboard: list/create pools, members, usage, rollups, join-links, revoke.
- **Data plane** — authenticated by a member JWT. Used by the CLI/proxy: join a pool, mint a
  short-lived access token, post telemetry.

**Invariants:** refresh tokens live only in Secret Manager and never appear in a response; the
service is the sole, serialized refresher of single-use rotating tokens.

| Method | Path | Plane |
|---|---|---|
| `GET` | `/v1/pools` | control |
| `POST` | `/v1/pools` | control |
| `GET` | `/v1/pools/:id/members` | control / member |
| `GET` | `/v1/pools/:id/usage` | control |
| `GET` | `/v1/pools/:id/rollups?days=14` | control |
| `GET`/`POST` | `/v1/pools/:id/join-links` | control |
| `DELETE` | `/v1/pools/:id/members/:mid` | control |
| `POST` | `/v1/pools/join` | data |
| `GET` | `/v1/pools/:id/token?serve=` | data |
| `POST` | `/v1/telemetry` | data |

Errors use a consistent envelope: `{ "error": { "code", "message", "requestId" } }`.

The full, interactive spec is on the **[API reference](/api/reference/)** page.
