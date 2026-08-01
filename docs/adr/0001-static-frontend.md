# ADR 0001 — Frontend estático no Cloudflare Pages

Status: aceito.

## Decisão

Usar Next.js exportado estaticamente no Cloudflare Pages. Autenticação e dados
autorizados usam Supabase; operações privilegiadas e IA usam FastAPI.

## Consequências

Baixo custo e deploy simples. Não dependemos de recursos server-side do Next.js;
proteção real permanece em RLS e backend, nunca apenas na navegação do cliente.
