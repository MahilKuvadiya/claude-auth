#!/usr/bin/env bash
# Move existing pool data from Firestore (claude-pool) → claudex_prod Postgres, then
# print row counts on both sides to verify. Idempotent (safe to re-run). Temporarily
# installs @google-cloud/firestore and removes it again (not a runtime dep).
# Run from repo root:  bash backend-api/scripts/migrate-prod-data.sh
set -euo pipefail
PROJECT=yash-test-495112; REGION=asia-south1; CLOUDSQL="$PROJECT:$REGION:claudex-db"
API="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SHARED="$(cd "$API/../infra/terraform/shared" && pwd)"
PW=$(terraform -chdir="$SHARED" state pull | python3 -c "import sys,json;s=json.load(sys.stdin);print(next(i['attributes']['result'] for r in s['resources'] if r['type']=='random_password' and r['name']=='db' for i in r['instances'] if i['index_key']=='prod'))")
URL="postgresql://claudex_prod:$PW@127.0.0.1:5432/claudex_prod"

nc -z 127.0.0.1 5432 2>/dev/null || { cloud-sql-proxy --port 5432 "$CLOUDSQL" >/tmp/claudex-proxy.log 2>&1 & sleep 6; trap 'kill %1 2>/dev/null || true' EXIT; }

cd "$API"
npm install @google-cloud/firestore >/dev/null 2>&1
echo "▶ dry run"
GCP_PROJECT=$PROJECT FIRESTORE_DB=claude-pool DATABASE_URL="$URL" node scripts/migrate-firestore.mjs --dry
echo "▶ apply"
GCP_PROJECT=$PROJECT FIRESTORE_DB=claude-pool DATABASE_URL="$URL" node scripts/migrate-firestore.mjs
npm rm @google-cloud/firestore >/dev/null 2>&1

echo "▶ verify (Postgres claudex_prod):"
PGPASSWORD="$PW" psql -h 127.0.0.1 -p 5432 -U claudex_prod -d claudex_prod -tA \
  -c "select 'pools='||count(*) from \"Pool\"" \
  -c "select 'members='||count(*) from \"Member\"" \
  -c "select 'joinLinks='||count(*) from \"JoinLink\"" \
  -c "select 'rollups='||count(*) from \"Rollup\""
echo "✓ done — compare against Firestore counts (pools:2 members:3 joinLinks:4 rollups:2)"
