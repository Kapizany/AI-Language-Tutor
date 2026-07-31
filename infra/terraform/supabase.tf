resource "supabase_project" "backend" {
  count = var.enable_supabase ? 1 : 0

  organization_id   = var.supabase_organization_id
  name              = local.resource_name
  database_password = var.supabase_database_password
  region            = var.supabase_region

  lifecycle {
    # Supabase does not support moving an existing project to another region.
    # Region changes require creating a new project and migrating the data.
    ignore_changes = [database_password, region]

    precondition {
      condition     = var.supabase_organization_id != null && var.supabase_organization_id != ""
      error_message = "supabase_organization_id is required when enable_supabase is true."
    }

    precondition {
      condition     = length(coalesce(var.supabase_database_password, "")) >= 12
      error_message = "supabase_database_password must contain at least 12 characters."
    }
  }
}

resource "supabase_settings" "backend" {
  count = var.enable_supabase ? 1 : 0

  project_ref = supabase_project.backend[0].id

  api = jsonencode({
    db_schema            = "public,storage,graphql_public"
    db_extra_search_path = "public,extensions"
    max_rows             = 1000
  })

  auth = jsonencode({
    site_url = var.site_url
    uri_allow_list = join(",", distinct(concat(
      var.additional_redirect_urls,
      ["${trimsuffix(var.site_url, "/")}/?auth=recovery"]
    )))
    disable_signup            = false
    enable_email_signup       = true
    enable_anonymous_sign_ins = false
    mailer_autoconfirm        = false
  })
}
