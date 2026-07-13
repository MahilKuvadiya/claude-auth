terraform {
  required_version = ">= 1.5"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
  # Shared/global resources are prod-owned; state lives in the prod state bucket.
  backend "gcs" {
    bucket = "claudex-tfstate-prod"
    prefix = "shared"
  }
}

provider "google" {
  project = var.project
}
