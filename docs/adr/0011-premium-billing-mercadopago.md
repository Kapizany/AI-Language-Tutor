# ADR 0011 — Monetização Premium com Mercado Pago

Status: aceito.

## Decisão

Assinaturas Premium self-serve usam **Mercado Pago Preapproval** no modelo
**Integração com Assinaturas**: o backend cria um preapproval `pending` e o
usuário conclui o pagamento no checkout hospedado do Mercado Pago via
`init_point` (redirect). Não há captura de cartão embutida no app em produção.

Durante a validação com credenciais reais, mensal e anual cobram
temporariamente R$ 5,00. Os preços comerciais devem ser restaurados antes do
lançamento.

O backend recebe webhooks e sincroniza `user_subscriptions` via RPC
`process_billing_event` / `sync_billing_subscription`.

- `POST /api/v1/billing/checkout/session` reserva tentativa, cria
  `POST /preapproval` com `status: pending` e devolve `checkout_url`
  (`init_point`), valor e ciclo.
- O frontend redireciona com `window.location.href = checkout_url`.
- Após o pagamento, o MP retorna para `back_url` (`#/billing/success`); o
  webhook confirma e a tela de sucesso chama `refreshPlan`.
- `POST /api/v1/billing/subscribe` permanece apenas para
  `MERCADOPAGO_MOCK_CHECKOUT=true` (ativa Premium local sem cobrança real).
- Checkouts `pending` reutilizáveis são carregados do banco quando o valor e o
  status ainda batem com o ciclo escolhido.

Cancelamentos respeitam **grace period**: `status = canceled` com `ends_at`
futuro mantém `resolve_user_plan()` em `premium` até a data.

O frontend expõe `#/pricing` com CTA “Assinar no Mercado Pago” e retorno
`#/billing/success|cancel`.

Webhooks:

- `subscription_preapproval` / `preapproval` → `GET /preapproval/{id}`
- `subscription_authorized_payment` → `GET /authorized_payments/{id}` e então
  sincroniza pelo `preapproval_id` (nunca tratar o id do pagamento autorizado
  como id de preapproval)

## Consequências

- Access token e webhook secret ficam só no backend
  (`MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`).
- A public key (`MERCADOPAGO_PUBLIC_KEY`) continua configurada para validar
  paridade TEST/APP_USR com o access token, mas não é exposta ao client no
  fluxo de checkout por redirect.
- O usuário pode criar ou usar conta Mercado Pago no checkout hospedado; não é
  obrigatório ter conta antes de iniciar a assinatura.
- Assinatura Premium exige cartão recorrente; Pix/boleto não entram neste
  fluxo porque não renovam sozinhos no modelo de Preapproval.
- Webhook público em `/api/v1/billing/webhook` deve apontar para URL estável.
- Toda notificação é autenticada pela assinatura HMAC `x-signature` antes de
  consultar ou alterar dados.
- Sincronização e registro idempotente do evento acontecem na mesma transação.
- Tentativas de checkout são limitadas no PostgreSQL por usuário.
- Admin continua podendo alterar planos manualmente (`subscription_source = admin`).
- `MERCADOPAGO_MOCK_CHECKOUT=true` permite fluxo local sem redirect/cobrança real.
- `MERCADOPAGO_TEST_CHECKOUT=true` mantém o sandbox, mas força
  `payer_email=test@testuser.com`; nunca deve ser ativado em produção.
- No Cloud Run, logs JSON carregam `request_id`, `trace_id`, operação, provedor e
  stack trace redigido para facilitar correlação sem expor credenciais ou e-mails.
- A aplicação no painel Mercado Pago deve estar em **Integração com Assinaturas**
  e usar credenciais dessa aplicação; credenciais de outro app podem aceitar
  `pending` mas falhar em fluxos `authorized`.
