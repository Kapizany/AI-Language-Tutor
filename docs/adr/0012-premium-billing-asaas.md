# ADR 0012 — Monetização Premium com Asaas

Status: aceito.

## Decisão

Assinaturas Premium self-serve migram de Mercado Pago para **Asaas**. O checkout
acontece **no site** (sem redirect para app externa):

- **Cartão**: formulário no frontend → `POST /subscriptions` com `creditCard` +
  `creditCardHolderInfo`.
- **PIX**: `POST /payments` com `billingType: PIX`; QR code e copia-e-cola exibidos
  na tela.
- **CPF** é obrigatório no checkout (campo `cpfCnpj` do customer Asaas).

Preços comerciais restaurados:

- Mensal: **R$ 19,90**
- Anual: **R$ 179,10**

Premium **só é liberado após confirmação de pagamento** (`PAYMENT_CONFIRMED` /
`PAYMENT_RECEIVED` via webhook ou refresh). A criação da assinatura/cobrança fica
em status `pending` até então.

Quando o Premium ativa, o backend envia e-mail ao usuário via **Resend**
(`RESEND_API_KEY`).

### Endpoints

- `POST /api/v1/billing/checkout/subscribe` — inicia checkout (cartão ou PIX).
- `POST /api/v1/billing/webhook` — webhook Asaas (header `asaas-access-token`).
- `POST /api/v1/billing/refresh` — polling do frontend enquanto aguarda confirmação.
- `POST /api/v1/billing/subscription/cancel` — cancelamento self-serve.

### Banco (Supabase)

Migration `20260802190000_asaas_billing.sql`:

- `subscription_source` aceita `asaas`.
- Coluna `payment_method` em `user_subscriptions` e `billing_checkouts`.
- RPCs generalizadas: `create_billing_checkout`, `process_billing_event`,
  `sync_billing_subscription`.

## Consequências

- Secrets no backend: `ASAAS_API_KEY`, `ASAAS_WEBHOOK_ACCESS_TOKEN`, opcionalmente
  `RESEND_API_KEY`.
- Mercado Pago permanece no código legado desativado (`MERCADOPAGO_BILLING_ENABLED=false`).
- PIX recorrente automático (Pix Automático) fica como evolução futura; v1 usa PIX
  avulso por ciclo com QR no site.
- Cancelamentos mantêm grace period até `ends_at`.
- `ASAAS_MOCK_CHECKOUT=true` permite fluxo local: checkout pending + refresh simula
  confirmação.

## Referências

- Substitui [ADR 0011](./0011-premium-billing-mercadopago.md) para novos checkouts.
- [Documentação Asaas — Assinaturas](https://docs.asaas.com/docs/assinaturas)
