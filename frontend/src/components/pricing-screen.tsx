"use client";

import { useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  Check,
  Crown,
  Lock,
  MessageCircle,
  Mic,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";

import { AppHeader } from "@/components/app-header";
import { PlanComparison } from "@/components/plan-comparison";
import { Button } from "@/components/ui";
import {
  createCheckoutSession,
  subscribeWithCardToken,
  type BillingCycle,
} from "@/lib/billing";
import { ApiClientError } from "@/lib/api-client";
import type { ScreenId } from "@/lib/learner";
import {
  CHECKOUT_TRUST_ITEMS,
  formatBrl,
  PLAN_COMPARISON,
  PREMIUM_PRICING,
  PREMIUM_VALUE_PROPS,
  PRICING_FAQ,
} from "@/lib/pricing";

type PricingScreenProps = {
  session: Session | null;
  displayName: string;
  go: (id: ScreenId) => void;
  onSubscribed?: () => void | Promise<void>;
};

const FREE_HIGHLIGHTS = [
  `${PLAN_COMPARISON.free.conversationSessions} conversas por dia`,
  `${PLAN_COMPARISON.free.messagesPerSession} mensagens por conversa`,
  "Todos os idiomas e cenários",
  "Resumo e vocabulário após cada sessão",
] as const;

const PREMIUM_HIGHLIGHTS = [
  `${PLAN_COMPARISON.premium.conversationSessions} conversas por dia`,
  `${PLAN_COMPARISON.premium.messagesPerSession} mensagens por conversa`,
  `${PLAN_COMPARISON.premium.transcriptions} transcrições de voz por dia`,
  "Correções e tutor com muito mais folga",
] as const;

export function PricingScreen({
  session,
  displayName,
  go,
  onSubscribed,
}: PricingScreenProps) {
  const [cycle, setCycle] = useState<BillingCycle>("annual");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const checkoutInFlight = useRef(false);

  const selectedPricing = PREMIUM_PRICING[cycle];

  const finishSubscription = async () => {
    if (session?.access_token && onSubscribed) {
      await onSubscribed();
    }
    go("billing-success");
  };

  const startCheckout = async () => {
    if (!session?.access_token) {
      go("login");
      return;
    }
    if (checkoutInFlight.current || loading) {
      return;
    }
    checkoutInFlight.current = true;
    setLoading(true);
    setError("");
    try {
      const checkout = await createCheckoutSession(session.access_token, cycle);
      if (checkout.mock_checkout) {
        await subscribeWithCardToken(
          session.access_token,
          cycle,
          "mock-card-token-local",
        );
        await finishSubscription();
        return;
      }
      window.location.href = checkout.checkout_url;
    } catch (caught) {
      checkoutInFlight.current = false;
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : "Não foi possível iniciar o checkout agora.",
      );
      setLoading(false);
    }
  };

  return (
    <div className="screen-content pricing-screen">
      <AppHeader
        title="Planos"
        subtitle="Escolha quanto praticar por dia — comece grátis ou desbloqueie o Premium."
        displayName={displayName}
        onNavigate={go}
      />

      <section className="pricing-hero">
        <span className="pricing-badge">
          <Crown size={16} aria-hidden="true" />
          Lume Premium
        </span>
        <h2>Estude todos os dias sem bater no limite</h2>
        <p>
          O Free é ótimo para experimentar. O Premium é para quem quer conversar mais,
          falar por voz com folga e manter conversas longas como numa aula de verdade.
        </p>
      </section>

      <div className="pricing-toggle" role="tablist" aria-label="Escolha o ciclo de cobrança">
        <button
          type="button"
          role="tab"
          aria-selected={cycle === "monthly"}
          className={cycle === "monthly" ? "active" : ""}
          onClick={() => {
            setCycle("monthly");
            setError("");
          }}
        >
          {PREMIUM_PRICING.monthly.label}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={cycle === "annual"}
          className={cycle === "annual" ? "active" : ""}
          onClick={() => {
            setCycle("annual");
            setError("");
          }}
        >
          {PREMIUM_PRICING.annual.label}
          <span className="pricing-toggle-badge">{PREMIUM_PRICING.annual.savingsLabel}</span>
        </button>
      </div>

      <div className="pricing-cards">
        <article className="pricing-plan-card pricing-plan-free">
          <header>
            <span className="pricing-plan-label">Free</span>
            <strong className="pricing-plan-price">R$ 0</strong>
            <span className="pricing-plan-cycle">Para começar hoje</span>
          </header>
          <ul className="pricing-plan-features">
            {FREE_HIGHLIGHTS.map((item) => (
              <li key={item}>
                <Check size={15} aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
          <Button variant="secondary" full onClick={() => go("dashboard")}>
            Continuar no Free
          </Button>
        </article>

        <article className="pricing-plan-card pricing-plan-premium is-featured">
          <span className="pricing-plan-badge">Recomendado</span>
          <header>
            <span className="pricing-plan-label">
              <Sparkles size={14} aria-hidden="true" />
              Premium
            </span>
            <div className="pricing-plan-price-block">
              <span className="pricing-plan-list-price">
                De {formatBrl(selectedPricing.listAmount)}
              </span>
              <strong className="pricing-plan-price">
                {formatBrl(selectedPricing.amount)}
              </strong>
              <span className="pricing-plan-cycle">{selectedPricing.suffix}</span>
            </div>
            <small className="pricing-plan-discount-line">
              Preço temporário para validar a cobrança real
            </small>
            <small className="pricing-plan-equivalent">{selectedPricing.billingNote}</small>
          </header>

          <ul className="pricing-plan-features">
            {PREMIUM_HIGHLIGHTS.map((item) => (
              <li key={item}>
                <Check size={15} aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>

          <section className="pricing-checkout-panel" aria-label="Resumo do checkout">
            <div className="pricing-checkout-summary">
              <span>Você assina</span>
              <strong>
                Premium {cycle === "annual" ? "anual" : "mensal"} · {formatBrl(selectedPricing.amount)}
              </strong>
              <small>
                Cobrança real de {formatBrl(selectedPricing.amount)}. Renovação automática até
                cancelar. Você conclui o pagamento no checkout seguro do Mercado Pago — não
                precisa ter conta MP antes; pode criar ou entrar na hora.
              </small>
            </div>

            <Button full onClick={() => void startCheckout()} disabled={loading}>
              {loading ? "Redirecionando..." : "Assinar no Mercado Pago"}
            </Button>

            <ul className="pricing-trust-row">
              {CHECKOUT_TRUST_ITEMS.map((item) => (
                <li key={item}>
                  <ShieldCheck size={14} aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </section>
        </article>
      </div>

      <section className="pricing-value-grid" aria-label="Benefícios Premium">
        {PREMIUM_VALUE_PROPS.map((item) => (
          <article key={item.title} className="pricing-value-card">
            <span className="pricing-value-stat">{item.stat}</span>
            <strong>{item.title}</strong>
            <p>{item.description}</p>
          </article>
        ))}
      </section>

      <section className="pricing-icons-row" aria-label="O que muda na prática">
        <article>
          <MessageCircle size={20} aria-hidden="true" />
          <strong>Conversas mais longas</strong>
          <p>Roleplay completo sem cortar a conversa no meio.</p>
        </article>
        <article>
          <Mic size={20} aria-hidden="true" />
          <strong>Mais prática por voz</strong>
          <p>Fale em áudio com transcrições generosas por dia.</p>
        </article>
        <article>
          <Zap size={20} aria-hidden="true" />
          <strong>Feedback sem travas</strong>
          <p>Correções e respostas do tutor com limites bem maiores.</p>
        </article>
        <article>
          <Lock size={20} aria-hidden="true" />
          <strong>Sem surpresas</strong>
          <p>Cancele quando quiser; o acesso continua até o fim do ciclo.</p>
        </article>
      </section>

      <PlanComparison variant="full" highlightColumn="premium" />

      <section className="pricing-faq">
        <h3>Perguntas frequentes</h3>
        <div className="pricing-faq-list">
          {PRICING_FAQ.map((item) => (
            <details key={item.question} className="pricing-faq-item">
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      {error && (
        <div className="form-message form-error" role="alert">
          {error}
        </div>
      )}

      <div className="pricing-footer">
        <button type="button" className="text-link" onClick={() => go("profile")}>
          Voltar ao perfil
        </button>
      </div>
    </div>
  );
}
