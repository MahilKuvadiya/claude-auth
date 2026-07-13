#!/usr/bin/env bash
# Retire the legacy stack AFTER prod is confirmed healthy and pool data is migrated
# (run migrate-prod-data.sh first). Backs up Firestore, deletes the 4 pool Cloud
# Functions + the old un-suffixed Cloud Run services, then (with typed confirmation)
# deletes the Firestore database. DESTRUCTIVE. Run from repo root.
set -euo pipefail
PROJECT=yash-test-495112; REGION=asia-south1
BACKUP="gs://claudex-tfstate-prod/firestore-backup-$(date +%Y%m%d-%H%M%S)"

echo "▶ backing up Firestore → $BACKUP"
gcloud firestore export "$BACKUP" --database=claude-pool --project "$PROJECT"

echo "▶ deleting legacy Cloud Functions (gen2)"
for fn in claudex-poolJoin claudex-poolToken claudex-telemetry claudexAdmin; do
  gcloud functions delete "$fn" --gen2 --region "$REGION" --project "$PROJECT" --quiet || true
done

echo "▶ deleting old un-suffixed Cloud Run services"
for svc in claudex-api claudex-docs; do
  gcloud run services delete "$svc" --region "$REGION" --project "$PROJECT" --quiet || true
done

echo
read -r -p "Type DELETE to permanently remove the Firestore database 'claude-pool' (backup at $BACKUP): " C
if [ "$C" = "DELETE" ]; then
  gcloud firestore databases delete --database=claude-pool --project "$PROJECT" --quiet
  echo "✓ Firestore claude-pool deleted"
else
  echo "• skipped Firestore deletion (functions + old services still removed). Delete later with:"
  echo "  gcloud firestore databases delete --database=claude-pool --project $PROJECT"
fi
echo "✓ decommission complete"
