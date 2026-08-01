# Contribuição

## Fluxo

- `main` é protegida e sempre implantável.
- Crie branches curtas: `feat/`, `fix/`, `docs/`, `refactor/` ou `chore/`.
- Abra pull request; não faça push direto em `main`.
- Migrations devem chegar antes do código que depende delas.
- Mudanças incompatíveis usam estratégia expand/migrate/contract.

## Commits

Use Conventional Commits:

```text
feat(frontend): add correction preference
fix(backend): reject unconfirmed accounts
docs(roadmap): close phase 3 requirements
```

Não inclua segredos, arquivos `.env`, state Terraform ou dados reais de alunos.
O autor decide quando criar o commit; automações não fazem commits.

## Validação

```bash
./scripts/validate-all.sh
```

O hook local valida somente áreas staged. Instale-o com:

```bash
./scripts/install-git-hooks.sh
```

Pull requests devem explicar risco, migrations, rollback, testes e impacto de
privacidade/custo.
