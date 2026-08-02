"use client";

import { useEffect, useRef, useState } from "react";
import { CardPayment, initMercadoPago } from "@mercadopago/sdk-react";

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
  const [brickReady, setBrickReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState("");
  const initializedKey = useRef<string | null>(null);
  const missingPublicKey = !session.public_key;

  useEffect(() => {
    if (!session.public_key) {
      return;
    }
    if (initializedKey.current === session.public_key) {
      return;
    }
    initMercadoPago(session.public_key, { locale: "pt-BR" });
    initializedKey.current = session.public_key;
  }, [session.public_key]);

  if (missingPublicKey) {
    return (
      <div className="form-message form-error" role="alert">
        Chave pública de pagamento ausente.
      </div>
    );
  }

  return (
    <div className={`pricing-brick${submitting ? " is-submitting" : ""}`}>
      {!brickReady && !localError && (
        <p className="pricing-brick-status" role="status">
          Carregando formulário de cartão…
        </p>
      )}
      {localError && (
        <div className="form-message form-error" role="alert">
          {localError}
        </div>
      )}
      {submitting && (
        <p className="pricing-brick-status" role="status">
          Confirmando assinatura…
        </p>
      )}
      <CardPayment
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
            maxInstallments: 1,
            types: {
              included: ["credit_card"],
            },
          },
        }}
        onReady={() => {
          setBrickReady(true);
          setLocalError("");
        }}
        onError={(error) => {
          const message =
            error?.message ||
            "Não foi possível carregar o formulário de pagamento. Verifique bloqueios do navegador e tente de novo.";
          setLocalError(message);
          onError(message);
        }}
        onSubmit={async (param) => {
          const token = param.token;
          if (!token) {
            const message = "Não foi possível tokenizar o cartão. Tente novamente.";
            setLocalError(message);
            onError(message);
            return;
          }
          setSubmitting(true);
          setLocalError("");
          try {
            await subscribeWithCardToken(
              accessToken,
              session.billing_cycle as BillingCycle,
              token,
            );
            onSuccess();
          } catch (caught) {
            const message =
              caught instanceof ApiClientError
                ? caught.message
                : "Não foi possível concluir a assinatura agora.";
            setLocalError(message);
            onError(message);
            setSubmitting(false);
            throw caught;
          }
        }}
      />
    </div>
  );
}
