output "terraform_state_bucket" {
  value       = google_storage_bucket.terraform_state.name
  description = "GCS bucket used by the main Terraform backend."
}

output "artifact_registry_repository" {
  value       = "${var.google_region}-docker.pkg.dev/${var.google_project_id}/${google_artifact_registry_repository.backend.repository_id}"
  description = "Artifact Registry repository used by backend releases."
}

output "workload_identity_provider" {
  value       = google_iam_workload_identity_pool_provider.github.name
  description = "Provider resource name for google-github-actions/auth."
}

output "terraform_service_account" {
  value       = google_service_account.github_terraform.email
  description = "Service account used by the infrastructure workflow."
}

output "deploy_service_account" {
  value       = google_service_account.github_deploy.email
  description = "Least-privilege service account used by backend releases."
}
