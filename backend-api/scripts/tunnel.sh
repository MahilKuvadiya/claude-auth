#!/usr/bin/env bash
# Cloud SQL proxy — opens a local tunnel to the claudex database on 127.0.0.1:5432.
# Runs in the foreground; Ctrl-C to stop. Keep it running in its own terminal, then
# start the API in another (scripts/dev-local.sh) or connect psql to 127.0.0.1:5432.
#
#   bash backend-api/scripts/tunnel.sh
set -euo pipefail
exec cloud-sql-proxy --port 5432 yash-test-495112:asia-south1:claudex-db
