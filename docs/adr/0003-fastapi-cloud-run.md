# ADR 0003 — FastAPI no Google Cloud Run

Status: aceito.

## Decisão

Executar a API FastAPI em container no Cloud Run, com escala mínima zero e
autenticação da aplicação por JWT Supabase.

## Consequências

O endpoint Cloud Run é público na rede, mas rotas privadas validam JWT e estado
da conta. Segredos vêm do Secret Manager e a identidade usa service account sem
chave JSON.
