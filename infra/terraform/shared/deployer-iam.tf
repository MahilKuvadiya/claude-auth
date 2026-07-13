# Extra deployer roles needed by the branch→env CI/CD pipeline (in addition to the
# run.admin / cloudbuild / artifactregistry.writer / storage.admin / serviceAccountUser
# roles already bound). CI runs `prisma migrate deploy` against the env DB through the
# Cloud SQL proxy, reading the DATABASE_URL secret — so the deployer needs:
resource "google_project_iam_member" "deployer_sql" {
  project = var.project
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_project_iam_member" "deployer_secrets" {
  project = var.project
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.deployer.email}"
}
