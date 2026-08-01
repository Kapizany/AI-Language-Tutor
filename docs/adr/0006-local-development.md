# ADR 0006 — Desenvolvimento local com Supabase CLI

Status: aceito.

## Decisão

Usar Supabase CLI para Postgres, Auth, Storage e serviços relacionados. Não
manter um Docker Compose paralelo que reproduziria apenas parte da plataforma.
Frontend e backend rodam nos gerenciadores nativos (`npm` e `uv`).

O test runner SQL continua usando um container PostgreSQL mínimo para rapidez na
CI; ele não substitui o smoke completo da Supabase CLI.

## Consequências

`supabase/config.toml` é versionado. `supabase start` e `supabase db reset`
compõem o teste de setup limpo. Docker continua sendo pré-requisito indireto.
