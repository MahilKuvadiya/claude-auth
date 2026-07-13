# UAT environment root. Resources are provisioned in Phase 1 via ../../modules/*,
# all named with the `-uat` / `_uat` suffix from local.suffix. Same project as prod;
# isolation is by naming + separate state + separate DB + separate SAs.

variable "project" {
  type    = string
  default = "yash-test-495112"
}
variable "project_number" {
  type    = string
  default = "632653045864"
}
variable "region" {
  type    = string
  default = "asia-south1"
}

locals {
  env    = "uat"
  suffix = "uat" # claudex-<component>-uat ; claudex_uat DB
}

# (Phase 1 populates: SAs, secrets, Cloud SQL DB, Cloud Run, WIF binding.)
