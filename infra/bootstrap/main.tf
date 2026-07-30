locals {
  bootstrap_apis = toset([
    "artifactregistry.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "sts.googleapis.com",
    "storage.googleapis.com",
  ])

  terraform_project_roles = toset([
    "roles/artifactregistry.admin",
    "roles/iam.serviceAccountUser",
    "roles/iam.serviceAccountAdmin",
    "roles/resourcemanager.projectIamAdmin",
    "roles/run.admin",
    "roles/secretmanager.admin",
    "roles/serviceusage.serviceUsageAdmin",
  ])

  deploy_project_roles = toset([
    "roles/artifactregistry.writer",
    "roles/iam.serviceAccountUser",
    "roles/run.developer",
  ])

  repository_principal = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}

resource "google_project_service" "bootstrap" {
  for_each = local.bootstrap_apis

  project            = var.google_project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_storage_bucket" "terraform_state" {
  project  = var.google_project_id
  name     = var.terraform_state_bucket_name
  location = "US"

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      num_newer_versions = 20
      with_state         = "ARCHIVED"
    }
    action {
      type = "Delete"
    }
  }

  depends_on = [google_project_service.bootstrap]
}

resource "google_artifact_registry_repository" "backend" {
  project       = var.google_project_id
  location      = var.google_region
  repository_id = "ai-language-tutor-development"
  description   = "Docker images for the Lume Tutor development backend"
  format        = "DOCKER"

  cleanup_policy_dry_run = false

  cleanup_policies {
    id     = "delete-untagged"
    action = "DELETE"

    condition {
      tag_state  = "UNTAGGED"
      older_than = "604800s"
    }
  }

  depends_on = [google_project_service.bootstrap]
}

resource "google_service_account" "github_terraform" {
  project      = var.google_project_id
  account_id   = "github-terraform"
  display_name = "GitHub Terraform"

  depends_on = [google_project_service.bootstrap]
}

resource "google_service_account" "github_deploy" {
  project      = var.google_project_id
  account_id   = "github-backend-deploy"
  display_name = "GitHub backend deploy"

  depends_on = [google_project_service.bootstrap]
}

resource "google_iam_workload_identity_pool" "github" {
  project                   = var.google_project_id
  workload_identity_pool_id = "github-actions"
  display_name              = "GitHub Actions"

  depends_on = [google_project_service.bootstrap]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = var.google_project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  display_name                       = "GitHub repository OIDC"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.actor"      = "assertion.actor"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }

  attribute_condition = "assertion.repository == '${var.github_repository}' && assertion.ref == 'refs/heads/${var.github_branch}'"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account_iam_member" "terraform_workload_identity" {
  service_account_id = google_service_account.github_terraform.name
  role               = "roles/iam.workloadIdentityUser"
  member             = local.repository_principal
}

resource "google_service_account_iam_member" "deploy_workload_identity" {
  service_account_id = google_service_account.github_deploy.name
  role               = "roles/iam.workloadIdentityUser"
  member             = local.repository_principal
}

resource "google_project_iam_member" "terraform" {
  for_each = local.terraform_project_roles

  project = var.google_project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.github_terraform.email}"
}

resource "google_project_iam_member" "deploy" {
  for_each = local.deploy_project_roles

  project = var.google_project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.github_deploy.email}"
}

resource "google_storage_bucket_iam_member" "terraform_state" {
  bucket = google_storage_bucket.terraform_state.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.github_terraform.email}"
}
