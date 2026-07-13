# Production cutover + Firestore retirement (Phase 9)

Everything through Phase 8 is built and verified on **UAT**. This runbook is the
**gated** production cutover — each step touches live prod, so run it deliberately
(outside auto-mode), verifying as you go. The public `claudex-dist` bucket and its
install URL are **never** touched, so the installed fleet keeps working throughout.

## 0. Preconditions
- UAT is green: `claudex-api-uat` deployed, pool + analytics flows pass.
- Deployer IAM applied: `terraform -chdir=infra/terraform/shared apply`
  (adds `roles/cloudsql.client` + `roles/secretmanager.secretAccessor` — plan-verified: 2 to add).
- Decide the prod admin bootstrap: GitHub repo **variable** `ADMIN_EMAILS`
  (e.g. `vishal.makwana@devxlabs.ai`) and **secret** `ENROLL_KEY` (random 32+ chars),
  plus variable `DASHBOARD_ORIGIN` (the console's prod origin).

## 1. Migrate the pool schema to prod (gated)
```
# via the Cloud SQL proxy → claudex_prod
DATABASE_URL="<prod url through proxy>" npx prisma migrate deploy
```
✅ Verify: 11 tables present in `claudex_prod`; re-run is a no-op.

## 2. Move existing pool data Firestore → Postgres
```
npm i @google-cloud/firestore          # temporary, not a runtime dep
GCP_PROJECT=yash-test-495112 FIRESTORE_DB=claude-pool \
  DATABASE_URL="<prod url>" node scripts/migrate-firestore.mjs --dry   # inspect
GCP_PROJECT=yash-test-495112 FIRESTORE_DB=claude-pool \
  DATABASE_URL="<prod url>" node scripts/migrate-firestore.mjs         # apply (idempotent)
npm rm @google-cloud/firestore         # remove the temp dep again
```
✅ Verify: pool/member/joinLink/rollup counts match Firestore. Refresh tokens untouched
(they stay in Secret Manager). Safe to re-run right before flipping traffic.

## 3. Deploy prod API
Push to `main` (triggers `deploy-api.yml` → `claudex-api-prod` + migrate), or deploy
manually with the same `gcloud run deploy claudex-api-prod …` args as the workflow.
✅ Verify: `GET https://<prod-run-url>/v1/health` = 200; a pool read returns migrated data.

## 4. Repoint clients at prod
- Dashboard: set `VITE_API_URL=https://<claudex-api-prod-url>` and redeploy the console.
- CLI collector: bake the prod URL as the `CLAUDEX_API` default in `bin/claudex`
  (constant `ANALYTICS_API`), and point the pool endpoints (`CLAUDEX_BACKEND`) at the
  new API. Ship via release-please → the dist bucket. The fleet self-updates.
✅ Verify: dashboard loads analytics for each role; a fresh `claudex` install enrolls
and syncs within 10 min.

## 5. Retire Firestore + legacy compute (after a soak period)
Only once prod is confirmed healthy on Postgres:
- Delete the 4 legacy pool Cloud Functions and the un-suffixed `claudex-api`/`claudex-docs`.
- Delete Firestore database `claude-pool` (export a backup first).
- Remove `firestore.rules`, `firebase.json` Firestore config, and the legacy `backend/`
  Cloud Functions source.
✅ Verify: zero Firestore references remain; fleet install/update still works; UAT
remains independent.

## Rollback
Each step is reversible before step 5. Cloud Run keeps prior revisions:
`gcloud run services update-traffic claudex-api-prod --to-revisions <prev>=100`.
Clients can be repointed back to the legacy endpoints until step 5 removes them.
