"use client";

import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  Check,
  Copy,
  Crown,
  CreditCard,
  Lock,
  MessageCircle,
  Mic,
  QrCode,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";

import { AppHeader } from "@/components/app-header";
import { PlanComparison } from "@/components/plan-comparison";
import { Button } from "@/components/ui";
import {
  refreshBillingSubscription,
  subscribeCheckout,
  type BillingCycle,
  type CheckoutSubscribeResponse,
  type PaymentMethod,
} from "@/lib/billing";
import { ApiClientError } from "@/lib/api-client";
import type { ScreenId } from "@/lib/learner";
import {
  CHECKOUT_TRUST_ITEMS,
  formatBrl,
  formatCpf,
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

type CheckoutStep = "form" | "pending";

export function PricingScreen({
  session,
  displayName,
  go,
  onSubscribed,
}: PricingScreenProps) {
  const [cycle, setCycle] = useState<BillingCycle>("annual");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
  const [step, setStep] = useState<CheckoutStep>("form");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [checkoutResult, setCheckoutResult] = useState<CheckoutSubscribeResponse | null>(null);
  const [cpf, setCpf] = useState("");
  const [cardHolderName, setCardHolderName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiryMonth, setCardExpiryMonth] = useState("");
  const [cardExpiryYear, setCardExpiryYear] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [holderPostalCode, setHolderPostalCode] = useState("");
  const [holderAddressNumber, setHolderAddressNumber] = useState("");
  const [holderPhone, setHolderPhone] = useState("");
  const [copiedPix, setCopiedPix] = useState(false);
  const checkoutInFlight = useRef(false);
  const pollRef = useRef<number | null>(null);

  const selectedPricing = PREMIUM_PRICING[cycle];

  useEffect(() => {
    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
      }
    };
  }, []);

  const finishSubscription = async () => {
    if (session?.access_token && onSubscribed) {
      await onSubscribed();
    }
    go("billing-success");
  };

  const startPolling = () => {
    if (!session?.access_token || pollRef.current) {
      return;
    }
    pollRef.current = window.setInterval(() => {
      void (async () => {
        try {
          const result = await refreshBillingSubscription(session.access_token!);
          if (result.plan_id === "premium" || result.subscription_status === "active") {
            if (pollRef.current) {
              window.clearInterval(pollRef.current);
              pollRef.current = null;
            }
            await finishSubscription();
          }
        } catch {
          // Keep polling until timeout or success.
        }
      })();
    }, 4000);
  };

  const submitCheckout = async () => {
    if (!session?.access_token) {
      go("login");
      return;
    }
    if (checkoutInFlight.current || loading) {
      return;
    }
    const cpfDigits = cpf.replace(/\D/g, "");
    if (cpfDigits.length !== 11) {
      setError("Informe um CPF válido com 11 dígitos.");
      return;
    }
    if (paymentMethod === "card") {
      if (!cardHolderName.trim() || !cardNumber.trim() || !cardExpiryMonth || !cardExpiryYear || !cardCvv) {
        setError("Preencha todos os dados do cartão.");
        return;
      }
    }

    checkoutInFlight.current = true;
    setLoading(true);
    setError("");
    setStatusMessage("");
    try {
      const result = await subscribeCheckout(session.access_token, {
        billing_cycle: cycle,
        payment_method: paymentMethod,
        cpf: cpfDigits,
        card_holder_name: paymentMethod === "card" ? cardHolderName.trim() : undefined,
        card_number: paymentMethod === "card" ? cardNumber.replace(/\D/g, "") : undefined,
        card_expiry_month: paymentMethod === "card" ? cardExpiryMonth : undefined,
        card_expiry_year: paymentMethod === "card" ? cardExpiryYear : undefined,
        card_cvv: paymentMethod === "card" ? cardCvv : undefined,
        holder_postal_code: paymentMethod === "card" ? holderPostalCode.replace(/\D/g, "") : undefined,
        holder_address_number: paymentMethod === "card" ? holderAddressNumber : undefined,
        holder_phone: paymentMethod === "card" ? holderPhone.replace(/\D/g, "") : undefined,
      });
      setCheckoutResult(result);
      setStep("pending");
      setStatusMessage(result.message);

      if (result.mock_checkout) {
        const refresh = await refreshBillingSubscription(session.access_token);
        if (refresh.plan_id === "premium" || refresh.subscription_status === "active") {
          await finishSubscription();
          return;
        }
      }

      startPolling();
    } catch (caught) {
      checkoutInFlight.current = false;
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : "Não foi possível iniciar o checkout agora.",
      );
    } finally {
      setLoading(false);
    }
  };

  const copyPixCode = async () => {
    if (!checkoutResult?.pix_copy_paste) return;
    try {
      await navigator.clipboard.writeText(checkoutResult.pix_copy_paste);
      setCopiedPix(true);
      window.setTimeout(() => setCopiedPix(false), 2000);
    } catch {
      setError("Não foi possível copiar o código PIX.");
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
              <strong className="pricing-plan-price">
                {formatBrl(selectedPricing.amount)}
              </strong>
              <span className="pricing-plan-cycle">{selectedPricing.suffix}</span>
            </div>
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

          <section className="pricing-checkout-panel" aria-label="Checkout Premium">
            {step === "form" ? (
              <>
                <div className="pricing-checkout-summary">
                  <span>Você assina</span>
                  <strong>
                    Premium {cycle === "annual" ? "anual" : "mensal"} · {formatBrl(selectedPricing.amount)}
                  </strong>
                  <small>
                    Premium liberado somente após confirmação do pagamento. Você receberá um e-mail
                    quando estiver ativo.
                  </small>
                </div>

                <div className="pricing-payment-toggle" role="tablist" aria-label="Forma de pagamento">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={paymentMethod === "card"}
                    className={paymentMethod === "card" ? "active" : ""}
                    onClick={() => setPaymentMethod("card")}
                  >
                    <CreditCard size={15} aria-hidden="true" />
                    Cartão
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={paymentMethod === "pix_automatic"}
                    className={paymentMethod === "pix_automatic" ? "active" : ""}
                    onClick={() => setPaymentMethod("pix_automatic")}
                  >
                    <QrCode size={15} aria-hidden="true" />
                    PIX
                  </button>
                </div>

                <div className="form-grid pricing-checkout-form">
                  <label>
                    CPF
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="000.000.000-00"
                      value={cpf}
                      onChange={(event) => setCpf(formatCpf(event.target.value))}
                    />
                  </label>

                  {paymentMethod === "card" && (
                    <>
                      <label>
                        Nome no cartão
                        <input
                          type="text"
                          autoComplete="cc-name"
                          value={cardHolderName}
                          onChange={(event) => setCardHolderName(event.target.value)}
                        />
                      </label>
                      <label>
                        Número do cartão
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="cc-number"
                          value={cardNumber}
                          onChange={(event) => setCardNumber(event.target.value.replace(/\D/g, "").slice(0, 16))}
                        />
                      </label>
                      <label>
                        Validade (MM)
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="cc-exp-month"
                          placeholder="MM"
                          value={cardExpiryMonth}
                          onChange={(event) => setCardExpiryMonth(event.target.value.replace(/\D/g, "").slice(0, 2))}
                        />
                      </label>
                      <label>
                        Validade (AAAA)
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="cc-exp-year"
                          placeholder="AAAA"
                          value={cardExpiryYear}
                          onChange={(event) => setCardExpiryYear(event.target.value.replace(/\D/g, "").slice(0, 4))}
                        />
                      </label>
                      <label>
                        CVV
                        <input
                          type="password"
                          inputMode="numeric"
                          autoComplete="cc-csc"
                          value={cardCvv}
                          onChange={(event) => setCardCvv(event.target.value.replace(/\D/g, "").slice(0, 4))}
                        />
                      </label>
                      <label>
                        CEP
                        <input
                          type="text"
                          inputMode="numeric"
                          value={holderPostalCode}
                          onChange={(event) => setHolderPostalCode(event.target.value.replace(/\D/g, "").slice(0, 8))}
                        />
                      </label>
                      <label>
                        Número do endereço
                        <input
                          type="text"
                          value={holderAddressNumber}
                          onChange={(event) => setHolderAddressNumber(event.target.value)}
                        />
                      </label>
                      <label>
                        Telefone (opcional)
                        <input
                          type="tel"
                          inputMode="tel"
                          value={holderPhone}
                          onChange={(event) => setHolderPhone(event.target.value.replace(/\D/g, "").slice(0, 11))}
                        />
                      </label>
                    </>
                  )}
                </div>

                <Button full onClick={() => void submitCheckout()} disabled={loading}>
                  {loading
                    ? "Processando..."
                    : paymentMethod === "card"
                      ? "Assinar com cartão"
                      : "Gerar PIX"}
                </Button>
              </>
            ) : (
              <div className="pricing-pending-panel">
                <p className="pricing-brick-status">{statusMessage}</p>
                {checkoutResult?.payment_method === "pix_automatic" && checkoutResult.pix_qr_code && (
                  <div className="pricing-pix-panel">
                    <img
                      src={`data:image/png;base64,${checkoutResult.pix_qr_code}`}
                      alt="QR Code PIX para pagamento"
                      className="pricing-pix-qr"
                    />
                    {checkoutResult.pix_copy_paste && (
                      <Button variant="secondary" full onClick={() => void copyPixCode()}>
                        <Copy size={15} aria-hidden="true" />
                        {copiedPix ? "Código copiado" : "Copiar código PIX"}
                      </Button>
                    )}
                  </div>
                )}
                {checkoutResult?.payment_method === "card" && (
                  <p className="pricing-pending-note">
                    Aguardando confirmação do pagamento no cartão. Isso pode levar alguns instantes.
                  </p>
                )}
                <Button variant="secondary" full onClick={() => go("profile")}>
                  Ver status no perfil
                </Button>
              </div>
            )}

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
