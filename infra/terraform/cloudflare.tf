resource "cloudflare_pages_project" "web" {
  count = var.enable_cloudflare_pages ? 1 : 0

  account_id        = var.cloudflare_account_id
  name              = local.resource_name
  production_branch = var.production_branch

  build_config = {
    build_command   = "npm run build"
    destination_dir = "out"
    root_dir        = "frontend"
    build_caching   = true
  }

  lifecycle {
    precondition {
      condition     = var.cloudflare_account_id != null && var.cloudflare_account_id != ""
      error_message = "cloudflare_account_id is required when enable_cloudflare_pages is true."
    }
  }
}

resource "cloudflare_pages_domain" "web" {
  count = var.enable_cloudflare_pages && var.cloudflare_pages_custom_domain != null ? 1 : 0

  account_id   = var.cloudflare_account_id
  project_name = cloudflare_pages_project.web[0].name
  name         = var.cloudflare_pages_custom_domain
}
