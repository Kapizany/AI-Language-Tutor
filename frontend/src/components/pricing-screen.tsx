"use client";

import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  Check,
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
import { PendingCheckoutPanel } from "@/components/pending-checkout-panel";
import { PlanComparison } from "@/components/plan-comparison";
import { Button } from "@/components/ui";
import {
  loadCheckoutStatus,
  refreshBillingSubscription,
  subscribeCheckout,
  type BillingCycle,
  type CheckoutStatus,
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

function checkoutStatusToResult(status: CheckoutStatus): CheckoutSubscribeResponse | null {
  if (
    !status.has_pending_checkout
    || !status.payment_method
    || !status.billing_cycle
    || !status.external_subscription_id
    || status.amount == null
  ) {
    return null;
  }
  return {
    status: status.payment_status === "confirmed" ? "confirmed" : "pending",
    payment_method: status.payment_method,
    external_subscription_id: status.external_subscription_id,
    amount: status.amount,
    currency: status.currency || "BRL",
    billing_cycle: status.billing_cycle,
    message: status.message || "",
    pix_qr_code: status.pix_qr_code,
    pix_copy_paste: status.pix_copy_paste,
    mock_checkout: false,
  };
}

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
  const [checkoutStatus, setCheckoutStatus] = useState<CheckoutStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [cpf, setCpf] = useState("");
  const [cardHolderName, setCardHolderName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiryMonth, setCardExpiryMonth] = useState("");
  const [cardExpiryYear, setCardExpiryYear] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [holderPostalCode, setHolderPostalCode] = useState("");
  const [holderAddressNumber, setHolderAddressNumber] = useState("");
  const [holderPhone, setHolderPhone] = useState("");
  const checkoutInFlight = useRef(false);
  const pollRef = useRef<number | null>(null);
  const accessToken = session?.access_token;

  const selectedPricing = PREMIUM_PRICING[cycle];

  useEffect(() => {
    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
      }
    };
  }, []);

  async function finishSubscription() {
    if (accessToken && onSubscribed) {
      await onSubscribed();
    }
    go("billing-success");
  }

  function startPolling() {
    if (!accessToken || pollRef.current) {
      return;
    }
    const token = accessToken;
    pollRef.current = window.setInterval(() => {
      void (async () => {
        try {
          const status = await loadCheckoutStatus(token);
          setCheckoutStatus(status);
          if (!status.has_pending_checkout) {
            if (pollRef.current) {
              window.clearInterval(pollRef.current);
              pollRef.current = null;
            }
            if (status.payment_status === "confirmed") {
              await refreshBillingSubscription(token);
              await finishSubscription();
            }
            return;
          }
          const restored = checkoutStatusToResult(status);
          if (restored) {
            setCheckoutResult(restored);
            setStatusMessage(restored.message);
          }
          if (status.payment_status === "confirmed") {
            if (pollRef.current) {
              window.clearInterval(pollRef.current);
              pollRef.current = null;
            }
            await refreshBillingSubscription(token);
            await finishSubscription();
          }
        } catch {
          // Keep polling until timeout or success.
        }
      })();
    }, 4000);
  }

  async function applyCheckoutStatus(status: CheckoutStatus) {
    setCheckoutStatus(status);
    if (!status.has_pending_checkout) {
      if (status.payment_status === "confirmed") {
        await finishSubscription();
      }
      return;
    }
    const restored = checkoutStatusToResult(status);
    if (restored) {
      setCheckoutResult(restored);
      setStep("pending");
      setStatusMessage(restored.message);
      if (status.payment_method) {
        setPaymentMethod(status.payment_method);
      }
      if (status.billing_cycle) {
        setCycle(status.billing_cycle);
      }
    }
    if (status.payment_status === "confirmed") {
      if (accessToken) {
        await refreshBillingSubscription(accessToken);
      }
      await finishSubscription();
      return;
    }
    startPolling();
  }

  useEffect(() => {
    if (!accessToken) {
      return;
    }
    let active = true;
    const restorePendingCheckout = async () => {
      setStatusLoading(true);
      try {
        const status = await loadCheckoutStatus(accessToken);
        if (!active) return;
        await applyCheckoutStatus(status);
      } catch {
        // Ignore restore errors; user can start a new checkout.
      } finally {
        if (active) {
          setStatusLoading(false);
        }
      }
    };
    void restorePendingCheckout();
    return () => {
      active = false;
    };
    // Restores pending checkout when the session token changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- applyCheckoutStatus is scoped to this screen.
  }, [accessToken]);

  async function refreshCheckoutStatus() {
    if (!accessToken) return;
    setStatusLoading(true);
    try {
      const status = await loadCheckoutStatus(accessToken);
      await applyCheckoutStatus(status);
    } finally {
      setStatusLoading(false);
    }
  }

  async function submitCheckout() {
    if (!accessToken) {
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
      const result = await subscribeCheckout(accessToken, {
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
      setCheckoutStatus({
        has_pending_checkout: true,
        payment_status: "pending",
        payment_method: result.payment_method,
        billing_cycle: result.billing_cycle,
        amount: result.amount,
        currency: result.currency,
        external_subscription_id: result.external_subscription_id,
        pix_qr_code: result.pix_qr_code,
        pix_copy_paste: result.pix_copy_paste,
        message: result.message,
      });
      setStep("pending");
      setStatusMessage(result.message);

      if (result.mock_checkout) {
        const refresh = await refreshBillingSubscription(accessToken);
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
              <PendingCheckoutPanel
                status={
                  checkoutStatus || {
                    has_pending_checkout: true,
                    payment_status: "pending",
                    payment_method: checkoutResult?.payment_method,
                    billing_cycle: checkoutResult?.billing_cycle,
                    amount: checkoutResult?.amount,
                    currency: checkoutResult?.currency,
                    external_subscription_id: checkoutResult?.external_subscription_id,
                    pix_qr_code: checkoutResult?.pix_qr_code,
                    pix_copy_paste: checkoutResult?.pix_copy_paste,
                    message: statusMessage || checkoutResult?.message || "",
                  }
                }
                loading={statusLoading}
                onRefresh={refreshCheckoutStatus}
                onGoToProfile={() => go("profile")}
                showProfileLink
              />
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
