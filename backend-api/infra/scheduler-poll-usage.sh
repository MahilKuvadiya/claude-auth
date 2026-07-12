#!/usr/bin/env bash
# Rate-limit headroom poller: Cloud Scheduler → POST /v1/internal/poll-usage every 15 min.
# The internal route checks a shared header token; for stronger auth, front with OIDC audience.
set -euo pipefail
P=${GCP_PROJECT:-yash-test-495112}
R=asia-south1
API_URL=${API_URL:?set API_URL to the deployed Cloud Run base, e.g. https://claudex-api-xxxx.a.run.app}
INTERNAL_TOKEN=${INTERNAL_TOKEN:?set INTERNAL_TOKEN (also set as the Cloud Run env var of the same name)}

gcloud scheduler jobs create http claudex-poll-usage --project "$P" --location "$R" \
  --schedule "*/15 * * * *" \
  --uri "$API_URL/v1/internal/poll-usage" \
  --http-method POST \
  --headers "x-internal-token=$INTERNAL_TOKEN,Content-Type=application/json" \
  --message-body '{}' \
  --attempt-deadline 120s \
  || gcloud scheduler jobs update http claudex-poll-usage --project "$P" --location "$R" \
       --schedule "*/15 * * * *" --uri "$API_URL/v1/internal/poll-usage" \
       --http-method POST --headers "x-internal-token=$INTERNAL_TOKEN,Content-Type=application/json" \
       --message-body '{}'

echo "scheduled: writes member.rateLimit {fiveHourPct,weeklyPct} every 15 min"
