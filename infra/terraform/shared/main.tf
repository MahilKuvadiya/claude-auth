# Global/shared resources — env-independent, adopted (imported) so they are TF-managed
# and can never be accidentally destroyed. The CLI-distribution bucket in particular
# is what the installed fleet self-updates from — it must never move.

# ---------------------------------------------------------------------------
# CLI distribution bucket (public read; fleet install + self-update URL)
# ---------------------------------------------------------------------------
resource "google_storage_bucket" "dist" {
  name                        = "claudex-dist"
  location                    = "US"
  uniform_bucket_level_access = true
  force_destroy               = false
}

resource "google_storage_bucket_iam_member" "dist_public_read" {
  bucket = google_storage_bucket.dist.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

# ---------------------------------------------------------------------------
# Workload Identity Federation (GitHub Actions) — repo-scoped
# ---------------------------------------------------------------------------
resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github-pool"
  display_name              = "GitHub Actions"
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-provider"
  display_name                       = "GitHub OIDC"
  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
  }
  attribute_condition = "assertion.repository=='${var.github_repo}'"
  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# ---------------------------------------------------------------------------
# Service accounts (shared): deployer (CI), and the existing api/ci SAs
# ---------------------------------------------------------------------------
resource "google_service_account" "deployer" {
  account_id   = "claudex-deployer"
  display_name = "claudex CI deployer (GitHub Actions)"
}

resource "google_service_account" "ci" {
  account_id   = "claudex-ci"
  display_name = "claudex CI uploader"
}
