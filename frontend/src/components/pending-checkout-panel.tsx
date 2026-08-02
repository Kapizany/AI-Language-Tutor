"use client";

import { useState } from "react";
import Image from "next/image";
import { Copy, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui";
import type { CheckoutStatus } from "@/lib/billing";
import { formatBrl } from "@/lib/pricing";

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  confirmed: "Confirmado",
  overdue: "Vencido",
  canceled: "Cancelado",
  processing: "Processando",
};

type PendingCheckoutPanelProps = {
  status: CheckoutStatus;
  loading?: boolean;
  onRefresh?: () => void | Promise<void>;
  onContinueCheckout?: () => void;
  showProfileLink?: boolean;
  onGoToProfile?: () => void;
};

export function PendingCheckoutPanel({
  status,
  loading = false,
  onRefresh,
  onContinueCheckout,
  showProfileLink = false,
  onGoToProfile,
}: PendingCheckoutPanelProps) {
  const [copiedPix, setCopiedPix] = useState(false);
  const [refreshError, setRefreshError] = useState("");

  if (!status.has_pending_checkout) {
    return null;
  }

  const paymentStatus = status.payment_status || "pending";
  const statusLabel = PAYMENT_STATUS_LABELS[paymentStatus] || paymentStatus;
  const billingCycleLabel = status.billing_cycle === "annual" ? "Anual" : "Mensal";
  const paymentMethodLabel =
    status.payment_method === "pix_automatic" ? "PIX" : "Cartão";

  const copyPixCode = async () => {
    if (!status.pix_copy_paste) return;
    try {
      await navigator.clipboard.writeText(status.pix_copy_paste);
      setCopiedPix(true);
      window.setTimeout(() => setCopiedPix(false), 2000);
    } catch {
      setRefreshError("Não foi possível copiar o código PIX.");
    }
  };

  const handleRefresh = async () => {
    if (!onRefresh) return;
    setRefreshError("");
    try {
      await onRefresh();
    } catch {
      setRefreshError("Não foi possível atualizar o status agora.");
    }
  };

  return (
    <div className="pending-checkout-panel">
      <div className="pending-checkout-header">
        <strong>Pagamento em andamento</strong>
        <span className={`pending-checkout-badge pending-checkout-badge-${paymentStatus}`}>
          {statusLabel}
        </span>
      </div>

      <p className="pending-checkout-message">{status.message}</p>

      <dl className="pending-checkout-meta">
        <div>
          <dt>Plano</dt>
          <dd>Premium {billingCycleLabel}</dd>
        </div>
        <div>
          <dt>Valor</dt>
          <dd>{status.amount != null ? formatBrl(status.amount) : "—"}</dd>
        </div>
        <div>
          <dt>Forma</dt>
          <dd>{paymentMethodLabel}</dd>
        </div>
      </dl>

      {status.payment_method === "pix_automatic" && status.pix_qr_code && paymentStatus === "pending" && (
        <div className="pricing-pix-panel">
          <Image
            src={`data:image/png;base64,${status.pix_qr_code}`}
            alt="QR Code PIX para pagamento"
            className="pricing-pix-qr"
            width={220}
            height={220}
            unoptimized
          />
          {status.pix_copy_paste && (
            <Button variant="secondary" full onClick={() => void copyPixCode()}>
              <Copy size={15} aria-hidden="true" />
              {copiedPix ? "Código copiado" : "Copiar código PIX"}
            </Button>
          )}
        </div>
      )}

      {status.payment_method === "card" && paymentStatus === "pending" && (
        <p className="pricing-pending-note">
          Aguardando confirmação do pagamento no cartão. Isso pode levar alguns instantes.
        </p>
      )}

      <div className="pending-checkout-actions">
        {onRefresh && (
          <Button variant="secondary" full disabled={loading} onClick={() => void handleRefresh()}>
            <RefreshCw size={15} aria-hidden="true" />
            {loading ? "Atualizando..." : "Atualizar status"}
          </Button>
        )}
        {onContinueCheckout && (
          <Button full onClick={onContinueCheckout}>
            Continuar pagamento
          </Button>
        )}
        {showProfileLink && onGoToProfile && (
          <Button variant="secondary" full onClick={onGoToProfile}>
            Ver no perfil
          </Button>
        )}
      </div>

      {refreshError && (
        <div className="form-message form-error" role="alert">
          {refreshError}
        </div>
      )}
    </div>
  );
}

export function checkoutStatusLabel(status: CheckoutStatus | null | undefined) {
  if (!status?.has_pending_checkout) return null;
  const paymentStatus = status.payment_status || "pending";
  return PAYMENT_STATUS_LABELS[paymentStatus] || paymentStatus;
}
