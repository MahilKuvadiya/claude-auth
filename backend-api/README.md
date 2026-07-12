# claudex-api

The unified, versioned REST API for claudex pools — one Fastify service on Cloud Run that replaces
the four gen2 Cloud Functions (`poolJoin`, `poolToken`, `telemetry`, `claudexAdmin`) in `../backend/`.
OpenAPI 3.1 is the source of truth (`openapi/claudex.v1.yaml`), served live at `/v1/docs`.

## Why
- The dashboard used to read Firestore directly (client SDK) — tight coupling + a second authz surface.
  Now every client (dashboard **and** CLI) goes through `/v1/*`.
- `poolToken` was overloaded three ways via query params. Split into clean resources.
- Adds input validation, consistent error envelope, structured logging, rate limiting, and tests.

## Planes
- **Control plane** (Firebase ID token, `org_admin`/`pod_lead`): pools, members, usage, rollups, join-links, revoke.
- **Data plane** (member JWT): join, token mint (sole serialized refresher), telemetry.

Invariants preserved from the old backend: refresh tokens live only in Secret Manager and never appear in a
response; token minting is serialized per member via a Firestore transaction.

## Endpoints
```
GET    /v1/pools                        POST /v1/pools            GET /v1/pools/:id
GET    /v1/pools/:id/members            DELETE /v1/pools/:id/members/:mid
GET    /v1/pools/:id/usage              GET /v1/pools/:id/rollups?days=14
GET    /v1/pools/:id/join-links         POST /v1/pools/:id/join-links
POST   /v1/pools/join                   GET /v1/pools/:id/token?serve=   POST /v1/telemetry
POST   /v1/internal/poll-usage (scheduler)   GET /v1/health   GET /v1/openapi.json   GET /v1/docs
```

## Develop
```sh
npm install
npm start                 # http://localhost:8080  (needs ADC for real GCP calls)
npm test                  # unit + contract (no external deps)
npm run test:emulator     # integration (Firestore emulator; SM + Anthropic mocked) — CI
```

## Layout
```
src/
  index.js server.js config.js
  plugins/{auth,errors}.js
  lib/{clients,secrets,anthropic,members,jwt,authz}.js
  routes/{health,openapi}.js  routes/control/*  routes/data/*  routes/internal/*
openapi/claudex.v1.yaml       test/{unit,integration,contract}
Dockerfile  DEPLOY.md  infra/{bigquery-subscription,scheduler-poll-usage,cmek,monitoring}.sh
```

Deploy + provisioning: see `DEPLOY.md`. Pending-pieces IaC: see `infra/`.
