export const PREMIUM_PRICING = {
  monthly: {
    amount: 19.9,
    label: "Mensal",
    suffix: "/mês",
    billingNote: "Cobrança mensal recorrente no cartão ou PIX",
  },
  annual: {
    amount: 179.1,
    label: "Anual",
    suffix: "/ano",
    savingsLabel: "Economize 2 meses",
    billingNote: "Cobrança anual recorrente no cartão ou PIX",
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
    speechSyntheses: 200,
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
    description: "Muito mais transcrições de voz, pronúncia natural e respostas do tutor por dia.",
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
        label: "Pronúncia com voz natural (TTS)",
        hint: "Ouça mensagens do tutor, correções e vocabulário no idioma estudado.",
        free: false,
        premium: true,
        boolean: true,
        highlight: true,
      },
      {
        label: "Reproduções de voz por dia",
        hint: "Cada clique em Ouvir conta como uma reprodução.",
        free: 0,
        premium: PLAN_COMPARISON.premium.speechSyntheses,
        highlight: false,
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
      "Sim. Cancele no perfil a qualquer momento. Seu Premium continua ativo até o fim do período já pago.",
  },
  {
    question: "Qual a diferença entre mensal e anual?",
    answer:
      "O mensal custa R$ 19,90 por mês. O anual custa R$ 179,10 por ano — equivalente a 2 meses grátis.",
  },
  {
    question: "O pagamento é seguro?",
    answer:
      "Sim. Cartão e PIX são processados pelo Asaas. O Lume não armazena dados do seu cartão.",
  },
  {
    question: "Quando o Premium é liberado?",
    answer:
      "Somente após a confirmação do pagamento. Você receberá um e-mail quando o Premium for ativado.",
  },
] as const;

export const CHECKOUT_TRUST_ITEMS = [
  "Pagamento seguro via Asaas",
  "Cancele quando quiser",
  "Premium só após confirmação",
] as const;

export const UPGRADE_HIGHLIGHTS = [
  `${PLAN_COMPARISON.premium.conversationSessions} conversas por dia`,
  `${PLAN_COMPARISON.premium.messagesPerSession} mensagens por conversa`,
  "Ouça pronúncia natural nas mensagens do tutor",
  `${PLAN_COMPARISON.premium.transcriptions} transcrições de voz por dia`,
] as const;

export function formatBrl(amount: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(amount);
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

export function formatCpf(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  }
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}
