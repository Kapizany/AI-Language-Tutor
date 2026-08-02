"use client";

import { useEffect, useRef, useState } from "react";
import { initMercadoPago, Payment } from "@mercadopago/sdk-react";

import { ApiClientError } from "@/lib/api-client";
import {
  subscribeWithCardToken,
  type BillingCycle,
  type CheckoutSession,
} from "@/lib/billing";

type PremiumPaymentBrickProps = {
  accessToken: string;
  session: CheckoutSession;
  onSuccess: () => void;
  onError: (message: string) => void;
};

export function PremiumPaymentBrick({
  accessToken,
  session,
  onSuccess,
  onError,
}: PremiumPaymentBrickProps) {
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const initializedKey = useRef<string | null>(null);

  useEffect(() => {
    if (!session.public_key) {
      return;
    }
    if (initializedKey.current === session.public_key) {
      setReady(true);
      return;
    }
    initMercadoPago(session.public_key, { locale: "pt-BR" });
    initializedKey.current = session.public_key;
    setReady(true);
  }, [session.public_key]);

  if (!ready) {
    return <p className="pricing-brick-status">Carregando formulário de cartão…</p>;
  }

  return (
    <div className={`pricing-brick${submitting ? " is-submitting" : ""}`}>
      {submitting && (
        <p className="pricing-brick-status" role="status">
          Confirmando assinatura…
        </p>
      )}
      <Payment
        locale="pt-BR"
        initialization={{
          amount: session.amount,
          payer: session.payer_email
            ? {
                email: session.payer_email,
              }
            : undefined,
        }}
        customization={{
          paymentMethods: {
            creditCard: "all",
            maxInstallments: 1,
          },
          visual: {
            hidePaymentButton: false,
            defaultPaymentOption: {
              creditCardForm: true,
            },
          },
        }}
        onReady={() => undefined}
        onError={() => {
          onError("Não foi possível carregar o formulário de pagamento.");
        }}
        onSubmit={async (param) => {
          const token = param.formData?.token;
          if (!token) {
            onError("Não foi possível tokenizar o cartão. Tente novamente.");
            return;
          }
          setSubmitting(true);
          try {
            await subscribeWithCardToken(
              accessToken,
              session.billing_cycle as BillingCycle,
              token,
            );
            onSuccess();
          } catch (caught) {
            onError(
              caught instanceof ApiClientError
                ? caught.message
                : "Não foi possível concluir a assinatura agora.",
            );
            setSubmitting(false);
            throw caught;
          }
        }}
      />
    </div>
  );
}
