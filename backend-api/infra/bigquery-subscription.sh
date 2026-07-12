#!/usr/bin/env bash
# Pub/Sub → BigQuery: land every telemetry event in claude_pool.usage_events.
# Idempotent-ish; safe to re-run (create calls error if they already exist).
set -euo pipefail
P=${GCP_PROJECT:-yash-test-495112}
DS=claude_pool
TABLE=usage_events
TOPIC=claude-pool-usage
SUB=claude-pool-usage-bq

# 1) dataset + partitioned table (schema matches the published telemetry message + publish metadata)
bq --project_id="$P" mk --dataset --location=asia-south1 "$P:$DS" 2>/dev/null || true
bq --project_id="$P" mk --table --time_partitioning_field=publish_time \
  --time_partitioning_type=DAY "$P:$DS.$TABLE" \
  'subscription_name:STRING,message_id:STRING,publish_time:TIMESTAMP,data:JSON,attributes:JSON' \
  2>/dev/null || echo "table exists"

# 2) BigQuery push subscription (uses the topic schema → table via the built-in BQ subscription)
gcloud pubsub subscriptions create "$SUB" --project "$P" \
  --topic "$TOPIC" \
  --bigquery-table "$P.$DS.$TABLE" \
  --write-metadata \
  || echo "subscription exists"

echo "done — events now stream to $P.$DS.$TABLE"
