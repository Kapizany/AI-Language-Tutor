# ADR 0010 — Planos, entitlements e administração

Status: aceito.

## Decisão

Planos (`free`, `premium`), assinaturas, entitlements diários e papéis
administrativos vivem no PostgreSQL com RLS. O FastAPI resolve plano, limites e
role exclusivamente com `service_role`. O frontend consome endpoints read-only
(`/account/entitlements`) ou administrativos (`/admin/*`) protegidos por JWT +
verificação de role no banco.

`llm_budget_policies.monthly_global_cost_usd` permanece como barreira global
final. Limites por usuário migraram para `plan_entitlements`.

`audit_events` continua para eventos de usuário; mutações administrativas usam
`admin_audit_logs`.

## Consequências

Novas features (TTS, etc.) devem declarar `feature_key` em `plan_entitlements` e
passar por `reserve_*`/`check_*` no backend. Promover administradores exige
escrita explícita em `user_roles` via migration ou script local — nunca cadastro
público.
