# ADR 0005 — Migrations e ordem de deploy

Status: aceito.

## Decisão

Schema vive em `supabase/migrations`. CI aplica migrations antes do código que
as utiliza. Mudanças destrutivas não compartilham release com a remoção do
suporte antigo.

## Consequências

Migrations são imutáveis após aplicadas, reproduzíveis do zero e testadas em
PostgreSQL temporário. Rollback de banco normalmente é uma migration corretiva,
não edição do histórico.
