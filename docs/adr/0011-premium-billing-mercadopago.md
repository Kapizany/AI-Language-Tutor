# ADR 0011 — Monetização Premium com Mercado Pago

Status: aceito.

## Decisão

Assinaturas Premium self-serve usam **Mercado Pago Preapproval** (recorrência
mensal R$ 19,90 ou anual R$ 179,10 — 9 meses pagos, 3 grátis). O FastAPI cria checkout, recebe webhooks
e sincroniza `user_subscriptions` via RPC `sync_billing_subscription`.

Cancelamentos respeitam **grace period**: `status = canceled` com `ends_at`
futuro mantém `resolve_user_plan()` em `premium` até a data.

O frontend expõe `#/pricing`, CTAs de upgrade nos limites e retorno
`#/billing/success|cancel`.

## Consequências

- Credenciais MP ficam só no backend (`MERCADOPAGO_ACCESS_TOKEN` e
  `MERCADOPAGO_WEBHOOK_SECRET`).
- Webhook público em `/api/v1/billing/webhook` deve apontar para URL estável.
- Toda notificação é autenticada pela assinatura HMAC `x-signature` antes de
  consultar ou alterar dados.
- Sincronização e registro idempotente do evento acontecem na mesma transação.
- Tentativas de checkout são limitadas no PostgreSQL por usuário.
- Admin continua podendo alterar planos manualmente (`subscription_source = admin`).
- `MERCADOPAGO_MOCK_CHECKOUT=true` permite fluxo local sem cobrança real.
