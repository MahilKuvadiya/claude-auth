#!/usr/bin/env bash
# One-shot cutover: migrate both env DBs + deploy both Cloud Run services.
# Idempotent. Run from the repo root:  bash backend-api/scripts/cutover.sh
# Requires: gcloud (authed as an editor/run.admin), terraform, cloud-sql-proxy, node.
set -euo pipefail

PROJECT=yash-test-495112
REGION=asia-south1
CLOUDSQL="$PROJECT:$REGION:claudex-db"
SHARED="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../infra/terraform/shared" && pwd)"
API="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

pw() { # $1 = uat|prod  → the DB password from terraform state
  terraform -chdir="$SHARED" state pull | python3 -c "import sys,json;s=json.load(sys.stdin);print(next(i['attributes']['result'] for r in s['resources'] if r['type']=='random_password' and r['name']=='db' for i in r['instances'] if i['index_key']=='$1'))"
}

echo "▶ starting Cloud SQL proxy…"
if ! nc -z 127.0.0.1 5432 2>/dev/null; then
  cloud-sql-proxy --port 5432 "$CLOUDSQL" >/tmp/claudex-proxy.log 2>&1 &
  PROXY=$!; trap 'kill $PROXY 2>/dev/null || true' EXIT
  sleep 6
fi

cd "$API"
for ENV in uat prod; do
  echo "▶ migrate claudex_$ENV"
  DATABASE_URL="postgresql://claudex_$ENV:$(pw "$ENV")@127.0.0.1:5432/claudex_$ENV" npx prisma migrate deploy

  echo "▶ deploy claudex-api-$ENV"
  gcloud run deploy "claudex-api-$ENV" \
    --source . --project "$PROJECT" --region "$REGION" --allow-unauthenticated \
    --service-account "claudex-api-$ENV@$PROJECT.iam.gserviceaccount.com" \
    --add-cloudsql-instances "$CLOUDSQL" \
    --set-secrets "DATABASE_URL=claudex-dburl-$ENV:latest" \
    --set-env-vars "GCP_PROJECT=$PROJECT,KMS_LOCATION=$REGION,USAGE_TOPIC=claude-pool-usage,JWT_SECRET=projects/632653045864/secrets/claudex-jwt-$ENV/versions/latest,DASHBOARD_ORIGIN=*,ADMIN_EMAILS=vishal.makwana@devxlabs.ai,ENROLL_DOMAINS=devxlabs.ai" \
    --min-instances 0 --max-instances 4 --cpu 1 --memory 512Mi --timeout 60 --quiet
done

echo
echo "════════════ SERVICE URLS ════════════"
for ENV in uat prod; do
  URL=$(gcloud run services describe "claudex-api-$ENV" --project "$PROJECT" --region "$REGION" --format='value(status.url)')
  echo "claudex-api-$ENV = $URL"
  echo "  health: $(curl -s "$URL/v1/health" || echo unreachable)"
done
echo "══════════════════════════════════════"
