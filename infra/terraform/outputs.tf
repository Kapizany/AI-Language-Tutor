output "cloudflare_pages_project" {
  description = "Cloudflare Pages project name."
  value       = try(cloudflare_pages_project.web[0].name, null)
}

output "cloudflare_pages_subdomain" {
  description = "Default Cloudflare Pages hostname."
  value       = try(cloudflare_pages_project.web[0].subdomain, null)
}

output "supabase_project_ref" {
  description = "Supabase project reference."
  value       = try(supabase_project.backend[0].id, null)
}
