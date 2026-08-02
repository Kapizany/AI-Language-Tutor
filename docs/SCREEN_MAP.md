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
- Acessibilidade: contraste AA, foco visível, skip link “Ir para o conteúdo”,
  alvos de toque ≥ 44 px e verificação axe/Playwright nas jornadas críticas.

## Rotas no app

O frontend estático usa **hash routing**: cada tela corresponde a `#/<id>`, por
exemplo `#/dashboard`, `#/conversation` e `#/admin`. A URL canônica de produção
é `https://ai-language-tutor.caps-labs.com`.

## Fluxo principal do aluno

```text
Landing (#/)
  → Demonstração (#/demo)
  → Cadastro (#/signup)
  → Confirmação de email (#/confirm-email)
  → Onboarding (#/onboarding)
  → Dashboard (#/dashboard)
  → Plano de estudo (#/plan)
  → Cenários (#/scenarios)
  → Conversa (#/conversation)
  → Resumo (#/summary)
  → Aprender / Revisar (#/learn, #/vocabulary)
  → Progresso (#/progress)
  → Perfil (#/profile)
  → Privacidade (#/privacy)
```

## Fluxo de múltiplos idiomas

O aluno pode estudar **vários idiomas** (inglês, espanhol, francês, italiano).
Cada idioma guarda seu **nível** em `learner_languages`; o idioma **ativo** fica
em `learner_preferences`.

```text
Header (bandeira / nome do idioma)
  → Painel “Seus idiomas”
  → Selecionar idioma já estudado
      → RPC switch_active_language
      → Conteúdo (lições, conversas, dashboard) usa nível salvo daquele idioma
  → Adicionar idioma (se ainda não estiver na lista)
      → RPC add_learner_language
      → Troca automática para o novo idioma (nível inicial: unknown ou definido no perfil)

Perfil (#/profile) → seção Idiomas
  → Ver todos os idiomas estudados e nível de cada um
  → Ajustar nível por idioma
  → Botão “Usar agora” para trocar o ativo
  → Adicionar outro idioma
```

Elementos de interface:

| Local | Comportamento |
|---|---|
| Header (`LanguageSwitcher`) | Dropdown com bandeira, nome, nível e check no idioma ativo |
| Perfil → Idiomas | Lista editável de idiomas + adicionar novo |
| Onboarding | Define o **primeiro** idioma e nível (também cria linha em `learner_languages`) |

## Navegação pós-login

**Desktop:** barra lateral com seções *Estudo* (Início, Aprender, Conversar) e
*Acompanhamento* (Rotina, Histórico, Revisar, Progresso), mais Configurações e
perfil compacto.

**Mobile:** barra inferior com quatro itens — Início, Aprender, Conversar e
**Menu** — que abre um sheet com Rotina, Histórico, Revisar, Progresso,
Configurações e Sair.

A tela de **conversa** ocupa a viewport inteira (`100dvh`) sem a barra lateral ou
inferior; o scroll fica restrito à área de mensagens.

## Telas do produto

| Rota (`#/…`) | Objetivo | Padrão utilizado |
|---|---|---|
| `landing` | Apresentar valor e iniciar demonstração | Hero focado em ação |
| `demo` | Entregar três interações sem cadastro | Chat guiado |
| `signup` | Criar conta | Formulário curto por email e senha |
| `login` | Retornar ao produto | Autenticação direta |
| `recover` | Recuperar acesso | Fluxo de uma tarefa |
| `confirm-email` | Confirmar cadastro e reenviar link | Orientação de tarefa única |
| `onboarding` | Definir idioma, nível, objetivo e rotina | Seis etapas progressivas |
| `dashboard` | Mostrar próxima melhor ação | Home personalizada |
| `plan` | Organizar semana e meta mensal | Agenda com progresso |
| `scenarios` | Escolher contexto de prática | Catálogo filtrável |
| `conversation` | Conversar e receber correções | Chat fullscreen com feedback inline |
| `summary` | Consolidar sessão | Pontos fortes e melhorias |
| `learn` | Leitura, gramática, exercícios e lições rápidas | Catálogo com retomada |
| `vocabulary` | Revisar erros e cartões pessoais | Fila de revisão |
| `sessions` | Histórico e retomada de conversas | Lista com status |
| `assessment` | Estimar nível | Avaliação em etapas (placeholder) |
| `progress` | Exibir evolução real | Métricas explicadas |
| `profile` | Ajustar preferências, idiomas e plano | Configurações agrupadas |
| `privacy` | Exportar e apagar dados | Controles transparentes |

### Subseções de `#/profile`

| Seção | Conteúdo |
|---|---|
| Perfil | Nome e email |
| Idiomas | Idiomas estudados, nível por idioma, trocar ativo, adicionar idioma |
| Plano e metas | Objetivo, minutos/dia, dias/semana, correções e **uso diário do plano** |
| Notificações | Placeholder futuro |

## Painel administrativo

Implementado em **`#/admin`**. A autorização é verificada no **backend**
(`GET /api/v1/admin/me`); usuários sem role `admin` em `user_roles` veem tela de
acesso negado. Ocultar links no frontend **não** é controle de segurança. Usuários com role
`admin` veem um atalho com ícone de escudo no header e o item **Administração**
em Perfil.

### Como acessar

1. Conta normal com onboarding concluído.
2. Promover o UUID no Supabase:

```sql
insert into public.user_roles (user_id, role)
values ('SEU-UUID', 'admin')
on conflict (user_id, role) do update set role = excluded.role;
```

3. Abrir `/#/admin` logado, com backend disponível.

Instruções completas: [`README.md`](../README.md#administration).

### Fluxo administrativo

```text
Login (#/login)
  → Abrir #/admin
  → Backend valida JWT + role admin
  → Painel (uma rota, quatro abas)
      → Visão geral
      → Usuários
      → Features
      → Auditoria
```

| Aba | Objetivo | API principal |
|---|---|---|
| Visão geral | Totais, DAU/WAU/MAU, distribuição por plano/idioma/nível, custo LLM | `GET /api/v1/admin/overview` |
| Usuários | Busca, detalhe, consumo diário, trocar plano, suspender/reativar | `GET/POST /api/v1/admin/users…` |
| Features | Uso normalizado por feature key | `GET /api/v1/admin/features` |
| Auditoria | Mutações administrativas rastreáveis | `GET /api/v1/admin/audit` |

Ações sensíveis (plano, suspensão) geram registro em `admin_audit_logs`. O
conteúdo privado das conversas **não** é exposto casualmente no painel.

Rotas separadas (`/admin/users`, `/admin/plans`, …) podem ser introduzidas no
futuro; hoje tudo vive em **`#/admin`** com navegação por abas.

## Áudio planejado (Fase 7)

- Palavras, frases, exemplos, explicações e mensagens do tutor terão ação de
  reprodução sob demanda.
- O controle mostrará loading, reproduzir, pausar, repetir, velocidade normal e
  lenta, além de falha recuperável.
- Google Cloud Standard TTS será o primeiro provider, acessado apenas pelo
  FastAPI.
- Os componentes visuais consumirão um contrato neutro e não conhecerão detalhes
  do provider.
- Reprodução automática permanecerá desativada por padrão.

**Já disponível:** gravação no navegador e transcrição via backend autenticado
(Fase 5 / voz gravada).

## Responsividade

- Desktop: navegação lateral, conteúdo em colunas e painel contextual na conversa.
- Tablet: navegação compacta e grades de duas colunas.
- Celular: navegação inferior (4 itens + menu sheet), cartões em uma coluna,
  conversa em tela cheia e compose fixo na base com safe-area.
