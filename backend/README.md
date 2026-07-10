# claudex backend

Three GCP Cloud Functions (gen2, Node 20). All Anthropic traffic still flows
through each developer's **local** proxy — this backend only custodies tokens,
mints short-lived access tokens, and ingests usage.

| Function | Trigger | Role |
|---|---|---|
| `poolJoin` | HTTP POST | validate targeted single-use link, store refresh token in Secret Manager, create member, return a member JWT |
| `poolToken` | HTTP GET `?serve=<memberId>` | sole refresher (serialized via Firestore txn) → short-lived access token |
| `telemetry` | HTTP POST | publish usage to Pub/Sub + increment Firestore daily rollups |

## Local run
```
cd backend && npm install
npm run start           # poolJoin on :8080   (start:token :8081, start:telemetry :8082)
```

## Deploy — PENDING APPROVAL (each is a GCP write)
Region `asia-south1`, service account `claude-pool-backend@yash-test-495112.iam.gserviceaccount.com`.

```sh
P=yash-test-495112; R=asia-south1
SA="claude-pool-backend@${P}.iam.gserviceaccount.com"

# 1) one-time: JWT signing secret used to mint/verify member tokens
printf '%s' "$(openssl rand -hex 32)" | gcloud secrets create claudex-member-jwt \
  --data-file=- --replication-policy=user-managed --locations=$R --project $P
gcloud secrets add-iam-policy-binding claudex-member-jwt \
  --member="serviceAccount:${SA}" --role=roles/secretmanager.secretAccessor --project $P

# 2) deploy the three functions
for FN in poolJoin poolToken telemetry; do
  gcloud functions deploy claudex-$FN --gen2 --runtime=nodejs20 --region=$R \
    --source=. --entry-point=$FN --trigger-http --service-account=$SA \
    --set-env-vars="GCP_PROJECT=$P,FIRESTORE_DB=claude-pool,KMS_LOCATION=$R,USAGE_TOPIC=claude-pool-usage" \
    --no-allow-unauthenticated --project $P
done
```

## Prereqs already provisioned
Firestore `claude-pool` (⏳ blocked on `datastore.owner` grant), Secret Manager + KMS
key `refresh-tokens`, Pub/Sub `claude-pool-usage`, BigQuery `claude_pool.usage_events`,
backend SA + roles. Firebase Auth (Google, domain-locked) still to configure for the dashboard.

## Notes
- `poolToken` caches the access token + expiry on the member doc and only refreshes
  inside a Firestore transaction, so parallel proxies never burn the single-use
  refresh token twice.
- Secrets are created per member on first join, encrypted with the CMEK key.
- BigQuery streaming from the Pub/Sub topic is wired by a subscription (push to a
  BQ subscription or a small consumer) — add once functions are deployed.
