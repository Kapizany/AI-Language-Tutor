# ADR 0004 — Gateways independentes de provider

Status: aceito.

## Decisão

LLM, transcrição e TTS usam interfaces próprias com adapters substituíveis.
Seleção, fallback, timeout, schema e custo são responsabilidade do gateway.

## Consequências

Features não importam SDKs de providers. Todo provider precisa de preço,
telemetria, testes de falha e avaliação mínima antes de produção.
