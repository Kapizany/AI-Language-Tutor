# Mapa de telas — AI Language Tutor

## Referências de mercado

O mapa utiliza padrões consolidados de produtos de aprendizagem, sem reproduzir
identidades visuais ou layouts proprietários:

- Duolingo: trilha diária, progresso visível e sequência de estudo.
- Busuu: metas, plano de estudo e previsão de progresso.
- Babbel: revisão estruturada e exercícios de fala com feedback.
- Speak: cenários conversacionais e feedback imediato do tutor.

## Sistema visual

- Cor principal: azul-petróleo.
- Cor de ação: coral.
- Fundo: creme claro.
- Feedback positivo: verde.
- Feedback de atenção: âmbar.
- Tipografia: sans-serif humanista, com títulos compactos.
- Componentes: cartões arredondados, bordas suaves e sombras discretas.
- Navegação: lateral no desktop e inferior no celular.
- Acessibilidade: contraste AA, foco visível e alvos de toque amplos.

## Fluxo principal

```text
Landing
  → Demonstração
  → Cadastro
  → Confirmação de email
  → Onboarding
  → Dashboard
  → Plano de estudo
  → Cenário
  → Conversa
  → Resumo
  → Vocabulário
  → Progresso
```

## Telas

| Rota conceitual | Objetivo | Padrão utilizado |
|---|---|---|
| `/` | Apresentar valor e iniciar demonstração | Hero focado em ação |
| `/demo` | Entregar três interações sem cadastro | Chat guiado |
| `/signup` | Criar conta | Formulário curto por email e senha |
| `/login` | Retornar ao produto | Autenticação direta |
| `/recover` | Recuperar acesso | Fluxo de uma tarefa |
| `/confirm-email` | Confirmar cadastro e reenviar link | Orientação de tarefa única |
| `/onboarding` | Definir idioma, nível, objetivo e rotina | Quatro etapas progressivas |
| `/dashboard` | Mostrar próxima melhor ação | Home personalizada |
| `/plan` | Organizar semana e meta mensal | Agenda com progresso |
| `/scenarios` | Escolher contexto de prática | Catálogo filtrável |
| `/conversation` | Conversar e receber correções | Chat com feedback inline |
| `/summary` | Consolidar sessão | Pontos fortes e melhorias |
| `/vocabulary` | Revisar palavras salvas | Fila de repetição espaçada |
| `/assessment` | Estimar nível | Avaliação em etapas |
| `/progress` | Exibir evolução real | Métricas explicadas |
| `/profile` | Ajustar preferências | Configurações agrupadas |
| `/privacy` | Exportar e apagar dados | Controles transparentes |

## Responsividade

- Desktop: navegação lateral, conteúdo em colunas e painel contextual.
- Tablet: navegação compacta e grades de duas colunas.
- Celular: navegação inferior, cartões em uma coluna e ações fixadas ao alcance
  do polegar.
