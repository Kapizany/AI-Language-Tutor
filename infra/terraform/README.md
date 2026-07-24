# Infrastructure

This directory provisions the initial, free-tier-compatible infrastructure for
AI Language Tutor:

- a Cloudflare Pages project for the web application;
- an optional Supabase project for PostgreSQL, authentication, and storage.

It intentionally does not provision an LLM account. Model providers are selected
at application runtime and their API keys must be stored as deployment secrets.

## Prerequisites

- Terraform 1.10 or newer;
- a Cloudflare account and API token with Pages edit permission;
- optionally, a Supabase organization and personal access token.

Terraform reads provider credentials from environment variables:

```bash
export CLOUDFLARE_API_TOKEN="..."
export SUPABASE_ACCESS_TOKEN="..."
```

Do not put either token in a `.tfvars` file.

## Configure

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
```

Update the account IDs. Keep `enable_supabase = false` until you are ready to
create the database project. Generate a unique database password with a password
manager; it will be present in Terraform state, so state must be treated as a
secret.

## Review and apply

```bash
terraform init
terraform fmt -check
terraform validate
terraform plan -out=development.tfplan
terraform apply development.tfplan
```

Never run `terraform apply` without inspecting the plan. Local state is suitable
only for initial development. Before adding collaborators or production, move it
to an encrypted remote backend with locking.

## Cost controls

- Cloudflare Pages starts on the free plan.
- Supabase is disabled by default and should start on its free plan.
- No R2 bucket, paid Worker, custom domain, or preview database branch is created.
- Use separate Terraform state for staging and production when those environments
  are actually needed.

Destroying a Supabase project deletes its database. Production resources should
eventually use deletion protection and backups before Terraform manages them.
