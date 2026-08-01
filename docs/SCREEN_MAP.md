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

Fluxo administrativo futuro:

```text
Login
  → Verificação de role no backend
  → Visão geral administrativa
  → Usuários | Planos | Uso por feature | Saúde e auditoria
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
| `/learn/*` | Acessar leitura, gramática, exercícios e lições rápidas | Catálogo com retomada |
| `/review` | Revisar erros observados em práticas e exercícios | Fila pessoal com atalhos |
| `/vocabulary` | Revisar palavras salvas | Fila de repetição espaçada |
| `/assessment` | Estimar nível | Avaliação em etapas |
| `/progress` | Exibir evolução real | Métricas explicadas |
| `/profile` | Ajustar preferências | Configurações agrupadas |
| `/privacy` | Exportar e apagar dados | Controles transparentes |

## Telas administrativas planejadas

Essas telas serão renderizadas somente depois da autorização administrativa no
backend. Ocultar links no frontend não é um controle de segurança.

| Rota conceitual | Objetivo |
|---|---|
| `/admin` | Resumir usuários, atividade, uso, custo e saúde |
| `/admin/users` | Buscar usuários, consultar consumo e administrar estado |
| `/admin/plans` | Configurar `Free`, `Premium` e entitlements |
| `/admin/features` | Comparar adoção, atividade, custo e falhas por feature |
| `/admin/audit` | Consultar mutações administrativas rastreáveis |

## Áudio planejado

- Palavras, frases, exemplos, explicações e mensagens do tutor terão ação de
  reprodução sob demanda.
- O controle mostrará loading, reproduzir, pausar, repetir, velocidade normal e
  lenta, além de falha recuperável.
- Google Cloud Standard TTS será o primeiro provider, acessado apenas pelo
  FastAPI.
- Os componentes visuais consumirão um contrato neutro e não conhecerão detalhes
  do provider.
- Reprodução automática permanecerá desativada por padrão.

## Responsividade

- Desktop: navegação lateral, conteúdo em colunas e painel contextual.
- Tablet: navegação compacta e grades de duas colunas.
- Celular: navegação inferior, cartões em uma coluna e ações fixadas ao alcance
  do polegar.
