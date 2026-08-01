# ADR 0007 — Idiomas e objetivos como domínio controlado

Status: aceito para o MVP.

## Decisão

Não criar `languages`, `learner_languages` e `learning_goals` no MVP. Idiomas,
níveis e objetivos são domínios pequenos protegidos por checks no banco e enums
no backend/frontend. `learner_preferences` representa o idioma ativo.

## Consequências

Menos joins e migrations no MVP. Antes de permitir idiomas dinâmicos, múltiplos
idiomas simultâneos ou objetivos administráveis, será feita uma migration
expand/migrate/contract para tabelas de referência.
