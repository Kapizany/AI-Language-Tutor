"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { CreditCard, RefreshCw } from "lucide-react";

import { PendingCheckoutPanel } from "@/components/pending-checkout-panel";
import { Button } from "@/components/ui";
import {
  cancelBillingSubscription,
  loadBillingHistory,
  loadCheckoutStatus,
  refreshBillingSubscription,
  type BillingHistory,
  type CheckoutStatus,
} from "@/lib/billing";
import { formatBrl } from "@/lib/pricing";

type BillingAccountPanelProps = {
  session: Session | null;
  onGoToPricing?: () => void;
  onSubscriptionChanged?: () => void | Promise<void>;
};

const CHECKOUT_STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  authorized: "Confirmado",
  cancelled: "Cancelado",
  failed: "Falhou",
};

const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  active: "Ativa",
  canceled: "Cancelada",
  pending: "Pendente",
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  PAYMENT_CONFIRMED: "Pagamento confirmado",
  PAYMENT_RECEIVED: "Pagamento recebido",
  PAYMENT_OVERDUE: "Pagamento vencido",
  PAYMENT_REFUNDED: "Pagamento estornado",
  PAYMENT_DELETED: "Pagamento removido",
  PAYMENT_CHARGEBACK_REQUESTED: "Chargeback solicitado",
  SUBSCRIPTION_CREATED: "Assinatura criada",
  SUBSCRIPTION_UPDATED: "Assinatura atualizada",
  SUBSCRIPTION_INACTIVATED: "Assinatura inativada",
  SUBSCRIPTION_DELETED: "Assinatura removida",
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR");
}

function paymentMethodLabel(method: string | null | undefined) {
  if (method === "pix_automatic") return "PIX";
  if (method === "card") return "Cartão";
  return method || "—";
}

export function BillingAccountPanel({
  session,
  onGoToPricing,
  onSubscriptionChanged,
}: BillingAccountPanelProps) {
  const [history, setHistory] = useState<BillingHistory | null>(null);
  const [checkoutStatus, setCheckoutStatus] = useState<CheckoutStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState("");
  const accessToken = session?.access_token;

  async function reload() {
    if (!accessToken) return;
    setLoading(true);
    setError("");
    try {
      const [historyResult, statusResult] = await Promise.all([
        loadBillingHistory(accessToken),
        loadCheckoutStatus(accessToken),
      ]);
      setHistory(historyResult);
      setCheckoutStatus(statusResult);
      if (onSubscriptionChanged) {
        await onSubscriptionChanged();
      }
    } catch {
      setError("Não foi possível carregar pagamentos e assinatura.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!accessToken) {
      return;
    }
    let active = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [historyResult, statusResult] = await Promise.all([
          loadBillingHistory(accessToken),
          loadCheckoutStatus(accessToken),
        ]);
        if (!active) return;
        setHistory(historyResult);
        setCheckoutStatus(statusResult);
        if (onSubscriptionChanged) {
          await onSubscriptionChanged();
        }
      } catch {
        if (active) {
          setError("Não foi possível carregar pagamentos e assinatura.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [accessToken, onSubscriptionChanged]);

  const refreshCheckoutStatus = async () => {
    if (!accessToken) return;
    setLoading(true);
    setError("");
    try {
      await refreshBillingSubscription(accessToken);
      await reload();
    } catch {
      setError("Não foi possível atualizar o status agora.");
      setLoading(false);
    }
  };

  const cancelSubscription = async () => {
    if (!accessToken || canceling) return;
    if (!window.confirm("Cancelar a renovação automática da assinatura Premium?")) return;
    setCanceling(true);
    setError("");
    try {
      await cancelBillingSubscription(accessToken);
      await reload();
    } catch {
      setError("Não foi possível cancelar a assinatura agora.");
    } finally {
      setCanceling(false);
    }
  };

  const subscription = history?.subscription;
  const planId = String(subscription?.plan_id || "free");
  const subscriptionStatus = String(subscription?.status || "active");
  const startedAt = subscription?.started_at ?? null;
  const renewsAt = subscription?.renews_at ?? null;
  const endsAt = subscription?.ends_at ?? null;
  const hasLifecycleDates = Boolean(startedAt || renewsAt || endsAt);
  const canManage =
    subscription?.subscription_source === "asaas" && planId === "premium";

  return (
    <section className="billing-account-panel">
      <div className="billing-account-header">
        <div>
          <h3>Pagamentos e assinatura</h3>
          <p>Acompanhe cobranças, status e histórico da sua assinatura Premium.</p>
        </div>
        <Button variant="secondary" disabled={loading} onClick={() => void reload()}>
          <RefreshCw size={15} aria-hidden="true" />
          {loading ? "Atualizando..." : "Atualizar"}
        </Button>
      </div>

      {error && (
        <div className="form-message form-error" role="alert">
          {error}
        </div>
      )}

      <div className="billing-account-summary">
        <article>
          <span>Plano atual</span>
          <strong>{planId === "premium" ? "Premium" : "Free"}</strong>
        </article>
        <article>
          <span>Assinatura</span>
          <strong>
            {SUBSCRIPTION_STATUS_LABELS[subscriptionStatus] || subscriptionStatus}
          </strong>
        </article>
        <article>
          <span>Forma de pagamento</span>
          <strong>{paymentMethodLabel(subscription?.payment_method)}</strong>
        </article>
        <article>
          <span>Ciclo</span>
          <strong>
            {subscription?.billing_cycle === "annual"
              ? "Anual"
              : subscription?.billing_cycle === "monthly"
                ? "Mensal"
                : "—"}
          </strong>
        </article>
      </div>

      {hasLifecycleDates && (
        <div className="billing-lifecycle">
          {startedAt && (
            <p>
              <strong>Início</strong>
              {formatDate(startedAt)}
            </p>
          )}
          {endsAt ? (
            <p>
              <strong>Término</strong>
              {formatDate(endsAt)}
            </p>
          ) : renewsAt ? (
            <p>
              <strong>Próxima renovação</strong>
              {formatDate(renewsAt)}
            </p>
          ) : null}
        </div>
      )}

      {checkoutStatus?.has_pending_checkout && (
        <PendingCheckoutPanel
          status={checkoutStatus}
          loading={loading}
          onRefresh={refreshCheckoutStatus}
          onContinueCheckout={onGoToPricing}
        />
      )}

      {canManage && subscriptionStatus !== "canceled" && (
        <div className="billing-management">
          <Button variant="danger" disabled={canceling} onClick={() => void cancelSubscription()}>
            {canceling ? "Cancelando..." : "Cancelar assinatura"}
          </Button>
          <p className="usage-note">O acesso continua até o fim do período pago.</p>
        </div>
      )}

      <div className="billing-history-section">
        <h4>Histórico de cobranças</h4>
        {history?.checkouts?.length ? (
          <ul className="billing-history-list">
            {history.checkouts.map((checkout) => (
              <li key={String(checkout.id ?? checkout.external_subscription_id)}>
                <div className="billing-history-item-main">
                  <strong>
                    Premium {checkout.billing_cycle === "annual" ? "Anual" : "Mensal"}
                  </strong>
                  <span className={`billing-history-badge billing-history-badge-${checkout.status}`}>
                    {CHECKOUT_STATUS_LABELS[String(checkout.status)] || checkout.status}
                  </span>
                </div>
                <div className="billing-history-item-meta">
                  <span>{paymentMethodLabel(checkout.payment_method)}</span>
                  <span>{checkout.amount != null ? formatBrl(checkout.amount) : "—"}</span>
                  <span>{formatDate(checkout.created_at)}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="usage-note">Nenhuma cobrança registrada ainda.</p>
        )}
      </div>

      <div className="billing-history-section">
        <h4>Eventos recentes</h4>
        {history?.events?.length ? (
          <ul className="billing-history-list billing-events-list">
            {history.events.map((eventItem) => (
              <li key={String(eventItem.id ?? eventItem.event_key)}>
                <div className="billing-history-item-main">
                  <strong>
                    {EVENT_TYPE_LABELS[String(eventItem.event_type)] || eventItem.event_type}
                  </strong>
                  {eventItem.payment_status && (
                    <span className="billing-history-badge">{eventItem.payment_status}</span>
                  )}
                </div>
                <div className="billing-history-item-meta">
                  <span>{formatDate(eventItem.processed_at)}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="usage-note">Os eventos do Asaas aparecerão aqui após confirmações e alterações.</p>
        )}
      </div>

      {planId === "free" && onGoToPricing && !checkoutStatus?.has_pending_checkout && (
        <Button full onClick={onGoToPricing}>
          <CreditCard size={15} aria-hidden="true" />
          Assinar Premium
        </Button>
      )}
    </section>
  );
}
