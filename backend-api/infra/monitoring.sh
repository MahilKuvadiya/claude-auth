#!/usr/bin/env bash
# Log-based metrics + alert policies for the API. Alerts need a notification channel id
# (create one in the console, or `gcloud alpha monitoring channels create`), passed as CHANNEL.
set -euo pipefail
P=${GCP_PROJECT:-yash-test-495112}
CHANNEL=${CHANNEL:-}   # e.g. projects/$P/notificationChannels/1234567890

# 1) log-based metric: token-refresh failures (the API logs "oauth refresh failed" via error path)
gcloud logging metrics create claudex_refresh_failures --project "$P" \
  --description "claudex token refresh failures" \
  --log-filter 'resource.type="cloud_run_revision" resource.labels.service_name="claudex-api" jsonPayload.message=~"oauth refresh failed"' \
  2>/dev/null || echo "metric claudex_refresh_failures exists"

# 2) log-based metric: 429s from upstream Anthropic (per-pool spike signal)
gcloud logging metrics create claudex_upstream_429 --project "$P" \
  --description "claudex upstream 429s" \
  --log-filter 'resource.type="cloud_run_revision" resource.labels.service_name="claudex-api" jsonPayload.status=429' \
  2>/dev/null || echo "metric claudex_upstream_429 exists"

echo "Metrics created. Recommended alert policies (create with CHANNEL set):"
echo "  - refresh failure rate > 5% over 5 min           (metric claudex_refresh_failures)"
echo "  - upstream 429s > threshold per pool over 10 min  (metric claudex_upstream_429)"
echo "  - telemetry ingest lag: Pub/Sub subscription oldest_unacked_message_age > 300s"
echo "Also build a Cloud Monitoring dashboard: request rate/latency/error (Cloud Run),"
echo "refresh success, active members (Firestore), BigQuery rows/day."
[ -n "$CHANNEL" ] && echo "(channel $CHANNEL will receive alerts once policies are added)"
