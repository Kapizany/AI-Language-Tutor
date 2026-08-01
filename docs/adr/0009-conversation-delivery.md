# ADR 0009 — Entrega e contexto das conversas

## Decisão

A Fase 5 usa respostas HTTP completas com indicador de atividade, cancelamento
servidor-side e replay idempotente. Streaming fica adiado até métricas reais
mostrarem que a latência prejudica a experiência.

O prompt mantém as doze mensagens mais recentes e uma condensação limitada das
mensagens anteriores. Cache de prompt fica adiado: os providers atuais não
oferecem uma estratégia portátil que justifique a complexidade no volume do
MVP.

## Consequência

O contrato permanece simples e intercambiável entre providers. Um
`request_id` identifica geração, custo e mensagens; respostas já geradas são
armazenadas antes da finalização do custo e podem ser reaplicadas sem uma nova
chamada ao modelo.
