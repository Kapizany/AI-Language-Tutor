export const PREMIUM_PRICING = {
  monthly: {
    amount: 19.9,
    label: "Mensal",
    suffix: "/mês",
    billingNote: "Cobrança mensal recorrente",
  },
  annual: {
    amount: 189.9,
    label: "Anual",
    suffix: "/ano",
    savingsLabel: "2 meses grátis",
    savingsPercent: 21,
    billingNote: "Cobrança anual recorrente",
  },
} as const;

export const PLAN_COMPARISON = {
  free: {
    conversationSessions: 2,
    llmRequests: 40,
    transcriptions: 10,
    messagesPerSession: 30,
  },
  premium: {
    conversationSessions: 20,
    llmRequests: 500,
    transcriptions: 100,
    messagesPerSession: 60,
  },
} as const;

export type PlanTier = keyof typeof PLAN_COMPARISON;

export const PREMIUM_VALUE_PROPS = [
  {
    title: "Pratique todo dia sem parar cedo",
    description: "Até 20 conversas por dia — ideal para quem estuda de forma consistente.",
    stat: "10× mais conversas",
  },
  {
    title: "Conversas longas, como na vida real",
    description: "Até 60 mensagens por sessão para aprofundar cenários sem interromper o fluxo.",
    stat: "2× mais mensagens",
  },
  {
    title: "Fale mais, ouça mais",
    description: "Muito mais transcrições de voz e respostas do tutor por dia.",
    stat: "10× mais voz",
  },
  {
    title: "Correções com folga",
    description: "Mais chamadas de IA para tutor, correções e exercícios sem travar no limite.",
    stat: "12× mais IA",
  },
] as const;

export const PLAN_FEATURE_GROUPS = [
  {
    title: "Prática diária",
    features: [
      {
        label: "Conversas com o tutor por dia",
        hint: "Cada cenário iniciado conta como uma conversa.",
        free: PLAN_COMPARISON.free.conversationSessions,
        premium: PLAN_COMPARISON.premium.conversationSessions,
        highlight: true,
      },
      {
        label: "Mensagens por conversa",
        hint: "Quanto mais mensagens, mais profunda fica a prática.",
        free: PLAN_COMPARISON.free.messagesPerSession,
        premium: PLAN_COMPARISON.premium.messagesPerSession,
        highlight: true,
      },
    ],
  },
  {
    title: "Voz e feedback",
    features: [
      {
        label: "Transcrições de áudio por dia",
        hint: "Cada mensagem falada usa uma transcrição.",
        free: PLAN_COMPARISON.free.transcriptions,
        premium: PLAN_COMPARISON.premium.transcriptions,
        highlight: true,
      },
      {
        label: "Chamadas de IA por dia",
        hint: "Respostas do tutor, correções e exercícios.",
        free: PLAN_COMPARISON.free.llmRequests,
        premium: PLAN_COMPARISON.premium.llmRequests,
        highlight: false,
      },
    ],
  },
  {
    title: "Incluído em ambos",
    features: [
      {
        label: "Todos os idiomas e cenários",
        free: true,
        premium: true,
        boolean: true,
      },
      {
        label: "Resumo pós-conversa e vocabulário",
        free: true,
        premium: true,
        boolean: true,
      },
      {
        label: "Atividades de leitura, gramática e flashcards",
        free: true,
        premium: true,
        boolean: true,
      },
    ],
  },
] as const;

export const PRICING_FAQ = [
  {
    question: "Posso cancelar quando quiser?",
    answer:
      "Sim. Cancele no Mercado Pago a qualquer momento. Seu Premium continua ativo até o fim do período já pago.",
  },
  {
    question: "Qual a diferença entre mensal e anual?",
    answer:
      "O plano anual custa R$ 189,90 por ano (equivalente a cerca de R$ 15,83/mês) e equivale a 2 meses grátis em relação ao mensal.",
  },
  {
    question: "O pagamento é seguro?",
    answer:
      "Sim. O checkout é processado pelo Mercado Pago. O Lume não armazena dados do seu cartão.",
  },
  {
    question: "Quando o Premium é liberado?",
    answer:
      "Assim que o pagamento for confirmado. Se demorar alguns segundos, abra Plano e metas no perfil ou aguarde a confirmação automática.",
  },
] as const;

export const CHECKOUT_TRUST_ITEMS = [
  "Pagamento via Mercado Pago",
  "Cancele quando quiser",
  "Acesso até o fim do ciclo pago",
] as const;

export const UPGRADE_HIGHLIGHTS = [
  `${PLAN_COMPARISON.premium.conversationSessions} conversas por dia`,
  `${PLAN_COMPARISON.premium.messagesPerSession} mensagens por conversa`,
  `${PLAN_COMPARISON.premium.transcriptions} transcrições de voz por dia`,
] as const;

export function formatBrl(amount: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(amount);
}

export function annualMonthlyEquivalent() {
  return PREMIUM_PRICING.annual.amount / 12;
}

export function annualVsMonthlyTotal() {
  return PREMIUM_PRICING.monthly.amount * 12;
}

export function formatMultiplier(free: number, premium: number) {
  if (!free) return null;
  const ratio = premium / free;
  if (ratio >= 10) return `${Math.round(ratio)}× mais`;
  if (ratio >= 2) return `${Math.round(ratio)}× mais`;
  if (ratio > 1) return "Mais folga";
  return null;
}

export function usagePercent(used: number, limit: number) {
  if (!limit) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

export function isNearLimit(used: number, limit: number, threshold = 0.8) {
  if (!limit) return false;
  return used / limit >= threshold;
}
