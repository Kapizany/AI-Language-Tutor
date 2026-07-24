variable "environment" {
  description = "Deployment environment name."
  type        = string
  default     = "development"

  validation {
    condition     = contains(["development", "staging", "production"], var.environment)
    error_message = "Environment must be development, staging, or production."
  }
}

variable "project_name" {
  description = "Base name used for provisioned resources."
  type        = string
  default     = "ai-language-tutor"

  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.project_name))
    error_message = "Project name may contain only lowercase letters, digits, and hyphens."
  }
}

variable "cloudflare_account_id" {
  description = "Cloudflare account ID. Required when Cloudflare resources are enabled."
  type        = string
  default     = null
  nullable    = true
}

variable "enable_cloudflare_pages" {
  description = "Create the Cloudflare Pages project."
  type        = bool
  default     = true
}

variable "production_branch" {
  description = "Git branch treated as production by Cloudflare Pages."
  type        = string
  default     = "main"
}

variable "enable_supabase" {
  description = "Create and configure a Supabase project."
  type        = bool
  default     = false
}

variable "supabase_organization_id" {
  description = "Supabase organization ID. Required when Supabase is enabled."
  type        = string
  default     = null
  nullable    = true
}

variable "supabase_database_password" {
  description = "Initial Supabase database password. Required when Supabase is enabled."
  type        = string
  default     = null
  nullable    = true
  sensitive   = true
}

variable "supabase_region" {
  description = "Supabase region close to the initial users. São Paulo is used by default."
  type        = string
  default     = "sa-east-1"
}

variable "site_url" {
  description = "Canonical application URL used by Supabase Auth redirects."
  type        = string
  default     = "http://localhost:3000"
}

variable "additional_redirect_urls" {
  description = "Additional allowed Supabase Auth redirect URLs."
  type        = list(string)
  default     = ["http://localhost:3000/**"]
}
