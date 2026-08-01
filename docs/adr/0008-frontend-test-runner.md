# ADR 0008 — Testes de frontend

## Decisão

Manter o test runner nativo do Node para testes unitários TypeScript e usar
Playwright para jornadas e acessibilidade. Vitest não será adicionado enquanto
não houver necessidade de DOM virtual, mocks complexos ou execução por
componente.

## Consequência

Há menos uma dependência e os testes atuais permanecem rápidos. Comportamentos
reais do navegador ficam exclusivamente no Playwright.
