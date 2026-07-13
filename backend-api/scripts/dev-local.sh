#!/usr/bin/env bash
# Run the API locally against a Cloud SQL database through the proxy tunnel, so the
# dashboard can be tested end-to-end without deploying. Firebase ID tokens are verified
# via your ADC; the JWT-secret routes (pool/enroll) are lazy and unused by the dashboard.
#
#   bash backend-api/scripts/dev-local.sh          # → claudex_uat (seeded)
#   bash backend-api/scripts/dev-local.sh prod     # → claudex_prod (real)
# Then set dashboard-app/.env.local:  VITE_API_URL=http://localhost:8080
set -euo pipefail
ENV=${1:-uat}
PROJECT=yash-test-495112
CLOUDSQL="$PROJECT:asia-south1:claudex-db"
API="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SHARED="$(cd "$API/../infra/terraform/shared" && pwd)"

if ! nc -z 127.0.0.1 5432 2>/dev/null; then
  echo "▶ starting Cloud SQL proxy (tunnel) on :5432"
  cloud-sql-proxy --port 5432 "$CLOUDSQL" >/tmp/claudex-sqlproxy.log 2>&1 &
  sleep 5
fi

PW=$(terraform -chdir="$SHARED" state pull | python3 -c "import sys,json;s=json.load(sys.stdin);print(next(i['attributes']['result'] for r in s['resources'] if r['type']=='random_password' and r['name']=='db' for i in r['instances'] if i['index_key']=='$ENV'))")

cd "$API"
[ -z "${GOOGLE_CLIENT_ID:-}" ] && echo "⚠  GOOGLE_CLIENT_ID not set — dashboard sign-in will 401. Export your GCP OAuth Web Client id:  GOOGLE_CLIENT_ID=... bash $0 $ENV"
echo "▶ API → http://localhost:8080   (DB: claudex_$ENV via tunnel)"
DATABASE_URL="postgresql://claudex_$ENV:$PW@127.0.0.1:5432/claudex_$ENV" \
  GCP_PROJECT=$PROJECT PORT=8080 DASHBOARD_ORIGIN='*' GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-}" npm start
