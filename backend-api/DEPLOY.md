# Deploying `claudex-api`

Unified REST API on Cloud Run (`asia-south1`, project `yash-test-495112`). CI builds/tests on every
PR and deploys on merge to `main` via keyless Workload Identity Federation
(`.github/workflows/deploy-api.yml`). This doc covers the **one-time provisioning** that must happen
before the first deploy. All commands are GCP writes — run them yourself (or with explicit approval).

```sh
P=yash-test-495112 ; R=asia-south1
```

## 1. Runtime service account (least privilege)
```sh
gcloud iam service-accounts create claudex-api --project $P \
  --display-name "claudex API (Cloud Run runtime)"
SA=claudex-api@$P.iam.gserviceaccount.com

# Firestore read/write
gcloud projects add-iam-policy-binding $P --member="serviceAccount:$SA" --role=roles/datastore.user
# Publish telemetry
gcloud pubsub topics add-iam-policy-binding claude-pool-usage --project $P \
  --member="serviceAccount:$SA" --role=roles/pubsub.publisher
# Secret Manager: create per-member secrets + read the JWT key (scope to claudex-* where possible)
gcloud projects add-iam-policy-binding $P --member="serviceAccount:$SA" --role=roles/secretmanager.admin
# KMS (CMEK for member secrets — see infra/cmek.sh)
gcloud kms keys add-iam-policy-binding refresh-tokens --project $P --location $R --keyring claude-pool \
  --member="serviceAccount:$SA" --role=roles/cloudkms.cryptoKeyEncrypterDecrypter
# Verify Firebase ID tokens (control-plane auth)
gcloud projects add-iam-policy-binding $P --member="serviceAccount:$SA" --role=roles/firebaseauth.viewer
```

## 2. Deployer service account + WIF impersonation
```sh
gcloud iam service-accounts create claudex-deployer --project $P \
  --display-name "claudex API deployer (GitHub Actions)"
DSA=claudex-deployer@$P.iam.gserviceaccount.com
for ROLE in run.admin iam.serviceAccountUser cloudbuild.builds.editor artifactregistry.writer storage.admin; do
  gcloud projects add-iam-policy-binding $P --member="serviceAccount:$DSA" --role=roles/$ROLE
done
# Let the deployer act as the runtime SA
gcloud iam service-accounts add-iam-policy-binding $SA --project $P \
  --member="serviceAccount:$DSA" --role=roles/iam.serviceAccountUser
# Bind the existing WIF provider (repo-scoped) to the deployer SA
gcloud iam service-accounts add-iam-policy-binding $DSA --project $P \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/632653045864/locations/global/workloadIdentityPools/github-pool/attribute.repository/vishalmakwana111/claudex"
```

## 3. First deploy
Either merge to `main` (CI does it) or manually:
```sh
cd backend-api
gcloud run deploy claudex-api --source . --project $P --region $R \
  --allow-unauthenticated --service-account claudex-api@$P.iam.gserviceaccount.com \
  --set-env-vars "GCP_PROJECT=$P,FIRESTORE_DB=claude-pool,KMS_LOCATION=$R,USAGE_TOPIC=claude-pool-usage,DASHBOARD_ORIGIN=https://<dashboard-origin>"
```
Set the GitHub Actions repo variable `DASHBOARD_ORIGIN` to the dashboard's URL.

## 4. Post-deploy
- Point the dashboard at the Cloud Run URL (`VITE_API_URL`) and the CLI at `CLAUDEX_API`.
- Run the pending-pieces scripts in `infra/` (BigQuery subscription, headroom scheduler, CMEK, monitoring).
- After clients are cut over, deploy the locked `firestore.rules` (deny-all reads once dashboard is on the API).

Auth posture: the service is `--allow-unauthenticated` (the CLI must reach it) but every route is
app-auth-gated (Firebase ID token or member JWT). Harden later with an external HTTPS LB + Cloud Armor.
