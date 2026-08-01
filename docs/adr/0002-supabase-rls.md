# ADR 0002 — Supabase PostgreSQL, Auth e RLS

Status: aceito.

## Decisão

Persistir dados no Supabase PostgreSQL e usar Supabase Auth. Toda tabela do
aluno habilita RLS; escritas sensíveis passam por RPCs estreitas ou backend.

## Consequências

Isolamento é testável em SQL. A `service_role` fica apenas no backend. Cada nova
tabela exige grants, políticas, teste negativo e estratégia de exclusão.
