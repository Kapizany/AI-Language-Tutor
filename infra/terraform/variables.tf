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

variable "cloudflare_pages_custom_domain" {
  description = "Optional custom hostname attached to the Cloudflare Pages project."
  type        = string
  default     = null
  nullable    = true
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

variable "enable_google_cloud" {
  description = "Provision the Google Cloud APIs, service account, registry, and secret containers."
  type        = bool
  default     = false
}

variable "google_project_id" {
  description = "Existing Google Cloud project ID. Required when Google Cloud is enabled."
  type        = string
  default     = null
  nullable    = true
}

variable "google_region" {
  description = "Google Cloud region for Artifact Registry and Cloud Run."
  type        = string
  default     = "us-east1"
}

variable "enable_cloud_run_backend" {
  description = "Create the Cloud Run backend after an application image and secret versions exist."
  type        = bool
  default     = false
}

variable "backend_container_image" {
  description = "Immutable Artifact Registry image URI, preferably pinned by digest. Required when Cloud Run is enabled."
  type        = string
  default     = null
  nullable    = true
}

variable "backend_supabase_url" {
  description = "Supabase project URL consumed by the backend."
  type        = string
  default     = null
  nullable    = true
}

variable "backend_public_url" {
  description = "Canonical public HTTPS URL of the backend, used by external webhooks."
  type        = string
  default     = null
  nullable    = true
}

variable "backend_allowed_origins" {
  description = "Browser origins allowed to call the FastAPI backend."
  type        = list(string)
  default     = ["https://ai-language-tutor.caps-labs.com"]
}

variable "cloud_run_min_instances" {
  description = "Minimum Cloud Run instances. Zero preserves scale-to-zero."
  type        = number
  default     = 0
}

variable "cloud_run_max_instances" {
  description = "Maximum Cloud Run instances used as an infrastructure cost guardrail."
  type        = number
  default     = 1

  validation {
    condition     = var.cloud_run_max_instances >= 1
    error_message = "cloud_run_max_instances must be at least 1."
  }
}

variable "enable_google_billing_budget" {
  description = "Create Google Cloud billing alerts scoped to this project. A budget alerts but does not automatically stop resources."
  type        = bool
  default     = false
}

variable "google_billing_account_id" {
  description = "Google Cloud billing account ID used for the optional project budget."
  type        = string
  default     = null
  nullable    = true
}

variable "google_monthly_budget_usd" {
  description = "Monthly Google Cloud alert budget in USD."
  type        = number
  default     = 5

  validation {
    condition     = var.google_monthly_budget_usd > 0
    error_message = "google_monthly_budget_usd must be greater than zero."
  }
}
