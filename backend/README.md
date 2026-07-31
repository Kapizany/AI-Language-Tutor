# AI Language Tutor API

FastAPI backend for authenticated AI requests, provider routing, usage
observability, and budget enforcement.

## Local setup

```bash
cd backend
cp .env.example .env
uv sync --dev
uv run uvicorn app.main:app --reload
```

The application defaults to Gemini 2.5 Flash-Lite with DeepSeek V4 Flash as
fallback. Tests inject the `mock` provider and do not consume paid tokens.

Endpoints:

- `GET /health`
- `GET /api/v1/me`
- `DELETE /api/v1/account`
- `POST /api/v1/ai/tutor/reply`

Run validation:

```bash
uv run ruff check .
uv run mypy app
uv run pytest
```

`SUPABASE_SERVICE_ROLE_KEY` is backend-only. Never expose it through a
`NEXT_PUBLIC_*` variable or commit it.

Account deletion requires an authenticated Supabase access token and the JSON
confirmation `{"confirmation":"EXCLUIR"}`. The backend deletes the Auth user
through the Supabase Admin API; profile, onboarding, progress, and usage rows
are removed by the database's `ON DELETE CASCADE` relationships.

## Provider routing

Choose the primary provider and ordered fallbacks through environment variables:

```env
LLM_PRIMARY_PROVIDER=gemini
LLM_FALLBACK_PROVIDERS=deepseek
```

Supported adapter names are `mock`, `deepseek`, `kimi`, and `gemini`. Real
providers require both an API key and current input/output prices. Startup fails
when a real provider is enabled with zero prices, preventing untracked spend.

Example production routing:

```env
LLM_PRIMARY_PROVIDER=gemini
LLM_FALLBACK_PROVIDERS=deepseek
```

The checked-in defaults use the official prices verified on 2026-07-29:

```env
GEMINI_MODEL=gemini-3.1-flash-lite
GEMINI_INPUT_USD_PER_MILLION=0.25
GEMINI_OUTPUT_USD_PER_MILLION=1.50
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_INPUT_USD_PER_MILLION=0.14
DEEPSEEK_OUTPUT_USD_PER_MILLION=0.28
```

DeepSeek input is accounted at the cache-miss rate, so cached requests are
conservatively overestimated. Review official pricing before each production
release. Kimi remains supported by the adapter but is not enabled.

## Budget enforcement

Apply `supabase/migrations/20260729120000_create_llm_usage_and_budgets.sql`
and `20260729160000_enforce_monthly_llm_budget.sql` before deploying the API.
They create:

- atomic request reservations;
- per-user daily request and cost limits;
- a global monthly cost limit;
- token, model, provider, latency, and estimated-cost events;
- read-only RLS access for users to their own usage.

Default initial limits are intentionally conservative:

```text
100 LLM requests per user/day
US$ 0.25 per user/day
US$ 10.00 globally/month
US$ 0.02 reserved per request
```

Change database limits through `public.llm_budget_policies`, not from the
frontend.
