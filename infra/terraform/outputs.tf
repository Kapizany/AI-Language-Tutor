output "cloudflare_pages_project" {
  description = "Cloudflare Pages project name."
  value       = try(cloudflare_pages_project.web[0].name, null)
}

output "cloudflare_pages_subdomain" {
  description = "Default Cloudflare Pages hostname."
  value       = try(cloudflare_pages_project.web[0].subdomain, null)
}

output "cloudflare_pages_custom_domain" {
  description = "Custom hostname attached to the Cloudflare Pages project."
  value       = try(cloudflare_pages_domain.web[0].name, null)
}

output "supabase_project_ref" {
  description = "Supabase project reference."
  value       = try(supabase_project.backend[0].id, null)
}

output "google_artifact_registry_repository" {
  description = "Artifact Registry Docker repository URI."
  value       = var.enable_google_cloud ? "${var.google_region}-docker.pkg.dev/${var.google_project_id}/${var.project_name}-${var.environment}" : null
}

output "google_backend_service_account" {
  description = "Runtime service account used by the FastAPI Cloud Run service."
  value       = try(google_service_account.backend[0].email, null)
}

output "google_backend_secret_ids" {
  description = "Secret Manager IDs whose values must be added outside Terraform."
  value       = try({ for key, secret in google_secret_manager_secret.backend : key => secret.secret_id }, {})
}

output "cloud_run_backend_url" {
  description = "Default Cloud Run URL for the FastAPI backend."
  value       = try(google_cloud_run_v2_service.backend[0].uri, null)
}
