#!/usr/bin/env bash
# CMEK for per-member refresh-token secrets. Grants the Secret Manager service agent
# encrypt/decrypt on the existing keyring key, then FLIP the code path.
set -euo pipefail
P=${GCP_PROJECT:-yash-test-495112}
R=asia-south1
PN=$(gcloud projects describe "$P" --format='value(projectNumber)')
SM_AGENT="service-$PN@gcp-sa-secretmanager.iam.gserviceaccount.com"

gcloud kms keys add-iam-policy-binding refresh-tokens \
  --project "$P" --location "$R" --keyring claude-pool \
  --member "serviceAccount:$SM_AGENT" \
  --role roles/cloudkms.cryptoKeyEncrypterDecrypter

cat <<'NOTE'
Granted. Now switch backend-api/src/lib/secrets.js writeRefreshToken() from:
    secret: { replication: { automatic: {} } }
to a user-managed replica pinned to asia-south1 with the CMEK key:
    secret: { replication: { userManaged: { replicas: [{
      location: 'asia-south1',
      customerManagedEncryption: { kmsKeyName:
        `projects/${config.project}/locations/${config.location}/keyRings/claude-pool/cryptoKeys/refresh-tokens` }
    }]}}}
Existing secrets keep Google-managed encryption until their next rotation (mixed state is expected).
NOTE
