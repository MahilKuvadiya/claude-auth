# Per-env runtime service accounts for the API (Cloud Run), + the member-JWT signing
# secret per env, + least-privilege IAM. One SA per environment.

resource "google_service_account" "api" {
  for_each     = local.envs
  account_id   = "claudex-api-${each.key}"
  display_name = "claudex API runtime (${each.key})"
}

# Member/analytics JWT signing key per env.
resource "google_secret_manager_secret" "jwt" {
  for_each  = local.envs
  secret_id = "claudex-jwt-${each.key}"
  replication {
    auto {}
  }
}

resource "random_password" "jwt" {
  for_each = local.envs
  length   = 48
  special  = false
}

resource "google_secret_manager_secret_version" "jwt" {
  for_each    = local.envs
  secret      = google_secret_manager_secret.jwt[each.key].id
  secret_data = random_password.jwt[each.key].result
}

# IAM: connect to Cloud SQL + manage claudex-* secrets (dburl, jwt, per-member refresh tokens).
resource "google_project_iam_member" "api_sql" {
  for_each = local.envs
  project  = var.project
  role     = "roles/cloudsql.client"
  member   = "serviceAccount:${google_service_account.api[each.key].email}"
}

resource "google_project_iam_member" "api_secrets" {
  for_each = local.envs
  project  = var.project
  role     = "roles/secretmanager.admin"
  member   = "serviceAccount:${google_service_account.api[each.key].email}"
}

# Deployer may act as each runtime SA (Cloud Run deploy).
resource "google_service_account_iam_member" "deployer_actas_api" {
  for_each           = local.envs
  service_account_id = google_service_account.api[each.key].name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deployer.email}"
}
