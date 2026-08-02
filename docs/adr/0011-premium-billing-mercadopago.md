# ADR 0011 — Monetização Premium com Mercado Pago

Status: aceito.

## Decisão

Assinaturas Premium self-serve usam **Mercado Pago Preapproval** com captura de
cartão via **Payment Brick** embutido no app. O frontend tokeniza o cartão
(`card_token_id`) e o FastAPI cria a assinatura já `authorized`, sem redirect
para o checkout hospedado do Mercado Pago.

Durante a validação com credenciais reais, mensal e anual cobram
temporariamente R$ 5,00. Os preços comerciais devem ser restaurados antes do
lançamento.

O backend recebe webhooks e sincroniza `user_subscriptions` via RPC
`process_billing_event` / `sync_billing_subscription`.

- `POST /api/v1/billing/checkout/session` devolve valor, ciclo e
  `MERCADOPAGO_PUBLIC_KEY` para montar o Brick.
- `POST /api/v1/billing/subscribe` recebe `{ billing_cycle, card_token_id, payer_email? }` e
  cria Preapproval com um único `POST /preapproval` (`status: authorized`, `card_token_id`).
  O `payer_email` enviado pelo Payment Brick tem prioridade sobre o e-mail do auth.
- Não há mais checkout por redirect (`init_point`); mock local usa
  `MERCADOPAGO_MOCK_CHECKOUT=true` e ativa Premium via `/subscribe`.

Cancelamentos respeitam **grace period**: `status = canceled` com `ends_at`
futuro mantém `resolve_user_plan()` em `premium` até a data.

O frontend expõe `#/pricing` com Brick de cartão, CTAs de upgrade nos limites e
retorno `#/billing/success|cancel`. Após subscribe bem-sucedido, o cliente
atualiza o plano imediatamente (`refreshPlan`).

Webhooks:

- `subscription_preapproval` / `preapproval` → `GET /preapproval/{id}`
- `subscription_authorized_payment` → `GET /authorized_payments/{id}` e então
  sincroniza pelo `preapproval_id` (nunca tratar o id do pagamento autorizado
  como id de preapproval)

## Consequências

- Access token e webhook secret ficam só no backend
  (`MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`).
- A public key (`MERCADOPAGO_PUBLIC_KEY`) é exposta ao client autenticado via
  `/billing/checkout/session` para inicializar o Brick.
- Assinatura Premium exige cartão; Pix/boleto não entram neste fluxo porque não
  renovam sozinhos no modelo de Preapproval.
- Webhook público em `/api/v1/billing/webhook` deve apontar para URL estável.
- Toda notificação é autenticada pela assinatura HMAC `x-signature` antes de
  consultar ou alterar dados.
- Sincronização e registro idempotente do evento acontecem na mesma transação.
- Tentativas de checkout são limitadas no PostgreSQL por usuário.
- Admin continua podendo alterar planos manualmente (`subscription_source = admin`).
- `MERCADOPAGO_MOCK_CHECKOUT=true` permite fluxo local sem Brick/cobrança real.
- `MERCADOPAGO_TEST_CHECKOUT=true` mantém o sandbox, mas força
  `payer_email=test@testuser.com`; nunca deve ser ativado em produção.
- No Cloud Run, logs JSON carregam `request_id`, `trace_id`, operação, provedor e
  stack trace redigido para facilitar correlação sem expor credenciais ou e-mails.
