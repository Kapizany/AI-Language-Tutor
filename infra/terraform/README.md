# Infrastructure

This directory provisions the initial, free-tier-compatible infrastructure for
AI Language Tutor:

- a Cloudflare Pages project for the web application;
- an optional Supabase project for PostgreSQL, authentication, and storage;
- optional Google Cloud APIs, Artifact Registry, Secret Manager, IAM, billing
  alerts, and a cost-constrained Cloud Run service for the FastAPI backend.

The planned text-to-speech phase will also enable the Google Cloud
Text-to-Speech API and grant the Cloud Run runtime service account only the
permission needed to synthesize speech. Application code will initially select
Google Standard TTS through a provider-neutral adapter.

It intentionally does not provision an LLM account. Model providers are selected
at application runtime and their API keys must be stored as deployment secrets.

## Prerequisites

- Terraform 1.10 or newer;
- a Cloudflare account and API token with Account > Cloudflare Pages > Edit;
- Zone > DNS > Edit for `caps-labs.com` when attaching the custom hostname;
- optionally, a Supabase organization and personal access token.
- optionally, an existing Google Cloud project with billing enabled and
  Application Default Credentials.

Terraform reads provider credentials from environment variables:

```bash
export CLOUDFLARE_API_TOKEN="..."
export SUPABASE_ACCESS_TOKEN="..."
gcloud auth application-default login
```

Do not put either token in a `.tfvars` file.

Terraform creates the Google Secret Manager resources but deliberately does not
manage secret versions. Putting secret values in Terraform variables would
persist them in state even when marked `sensitive`.

The backend currently consumes these secret containers:

- `gemini-api-key-<environment>`;
- `deepseek-api-key-<environment>`;
- `supabase-service-role-key-<environment>`;
- `mercadopago-access-token-<environment>`;
- `mercadopago-webhook-secret-<environment>`.

The infrastructure workflow receives both Mercado Pago values from GitHub
Environment secrets, adds Secret Manager versions outside Terraform state, and
then deploys Cloud Run. Configure `MERCADOPAGO_ACCESS_TOKEN` and
`MERCADOPAGO_WEBHOOK_SECRET` as GitHub Environment secrets, plus
`BACKEND_PUBLIC_URL` as a GitHub Environment variable. Never use `TF_VAR_*` for
the secret values.

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
- No R2 bucket, paid Worker, or preview database branch is created. The optional
  Pages custom domain uses the existing Cloudflare-managed zone and does not
  add a separate paid service.
- Use separate Terraform state for staging and production when those environments
  are actually needed.

Destroying a Supabase project deletes its database. Production resources should
eventually use deletion protection and backups before Terraform manages them.

## Deployment ownership

Terraform owns the Cloudflare Pages and Supabase project resources and their
platform settings, including the Pages custom domain and Supabase Auth URLs.
Application releases are intentionally handled separately:

- the Supabase GitHub integration applies new files from
  `supabase/migrations/` when they reach `main`;
- GitHub Actions validates and deploys `frontend/out` to the existing Direct
  Upload Cloudflare Pages project.

Do not add schema SQL directly to Terraform and do not run concurrent manual and
automatic migration deployments.

## Google Cloud backend bootstrap

Google Cloud deployment uses two applies:

1. Enable `enable_google_cloud` to create APIs, the runtime service account,
   Artifact Registry, empty secrets, IAM, and optional billing alerts.
2. Add secret versions and push a Docker image outside Terraform.
3. Set `enable_cloud_run_backend = true` and provide the image URI to create
   Cloud Run.

The one-time bootstrap in `infra/bootstrap` creates the remote-state bucket,
Artifact Registry, and GitHub OIDC identities. After that, GitHub Actions owns
infrastructure applies and backend releases without static Google credentials.
Detailed commands are in `.local/GOOGLE_CLOUD_TERRAFORM.md`.

## Planned Text-to-Speech infrastructure

The TTS rollout should be managed by Terraform where the Google provider
supports it:

- enable `texttospeech.googleapis.com`;
- authorize the existing Cloud Run runtime service account with least
  privilege;
- expose non-secret provider and default-voice configuration to Cloud Run;
- keep provider selection configurable, initially `google_standard`;
- add quota/budget monitoring before enabling broad access.

Application Default Credentials on Cloud Run must be used instead of creating a
downloadable service-account key. Audio-cache storage will only be provisioned
after its retention, access and deletion policy is defined.
