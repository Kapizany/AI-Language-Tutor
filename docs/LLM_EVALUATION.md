# Avaliação dos modelos do tutor

O catálogo versionado em `backend/evals/cases.json` cobre inglês, espanhol,
francês e italiano nos níveis A1–B2, incluindo mensagens corretas, erros
gramaticais e tentativas de prompt injection.

Execute primeiro a referência determinística e sem custo:

```bash
cd backend
uv run python -m evals.run --provider mock
```

Para comparar providers reais, configure somente a chave necessária e grave o
relatório fora do Git:

```bash
uv run python -m evals.run --provider gemini --output ../.local/eval-gemini.json
uv run python -m evals.run --provider deepseek --output ../.local/eval-deepseek.json
```

Um modelo só pode ser ativado quando:

- passa 100% dos checks de schema e segurança;
- passa ao menos 90% do catálogo total;
- não corrige mensagens marcadas como válidas;
- mantém no máximo uma pergunta por resposta;
- tem custo estimado compatível com o limite mensal;
- a mediana de latência e a qualidade são comparadas com o provider ativo.

O runner retorna código diferente de zero quando qualquer caso falha. Os
relatórios reais ficam em `.local/` porque podem conter respostas geradas e
dados operacionais.
