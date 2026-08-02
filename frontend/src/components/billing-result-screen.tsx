"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ArrowRight, Check, CheckCircle2, Crown, XCircle } from "lucide-react";

import { Button } from "@/components/ui";
import { refreshBillingSubscription } from "@/lib/billing";
import type { ScreenId } from "@/lib/learner";
import { CHECKOUT_TRUST_ITEMS, PLAN_COMPARISON, PREMIUM_VALUE_PROPS } from "@/lib/pricing";

type BillingResultScreenProps = {
  session: Session | null;
  variant: "success" | "cancel";
  go: (id: ScreenId) => void;
};

const UNLOCKED_BENEFITS = [
  `${PLAN_COMPARISON.premium.conversationSessions} conversas por dia`,
  `${PLAN_COMPARISON.premium.messagesPerSession} mensagens por conversa`,
  `${PLAN_COMPARISON.premium.transcriptions} transcrições de voz por dia`,
  "Correções e tutor com muito mais folga",
] as const;

export function BillingResultScreen({ session, variant, go }: BillingResultScreenProps) {
  const [status, setStatus] = useState<"pending" | "premium" | "processing" | "error">(
    variant === "success" ? "pending" : "processing",
  );
  const [message, setMessage] = useState(
    variant === "success" ? "Confirmando sua assinatura..." : "Nenhuma cobrança foi feita.",
  );
  const ready = variant !== "success" || status !== "pending";

  useEffect(() => {
    if (variant !== "success" || !session?.access_token) {
      return;
    }
    let active = true;
    const sync = async () => {
      try {
        const result = await refreshBillingSubscription(session.access_token);
        if (!active) return;
        if (result.plan_id === "premium") {
          setStatus("premium");
          setMessage("Premium ativado. Bons estudos!");
        } else {
          setStatus("processing");
          setMessage(
            "Pagamento recebido. Se o Premium ainda não aparecer, aguarde alguns segundos e abra Plano e metas.",
          );
        }
      } catch {
        if (active) {
          setStatus("error");
          setMessage(
            "Retorno concluído. Se o Premium não aparecer em instantes, abra Plano e metas no perfil.",
          );
        }
      }
    };
    void sync();
    return () => {
      active = false;
    };
  }, [session?.access_token, variant]);

  const isSuccess = variant === "success";
  const isPremium = status === "premium";

  return (
    <div className="screen-content billing-result-screen">
      <section className={`billing-result-card billing-result-${variant}${isPremium ? " is-premium" : ""}`}>
        <div className="billing-result-icon">
          {isSuccess ? (
            <CheckCircle2 size={44} aria-hidden="true" />
          ) : (
            <XCircle size={44} aria-hidden="true" />
          )}
        </div>

        <span className="billing-result-eyebrow">
          {isSuccess ? "CHECKOUT CONCLUÍDO" : "CHECKOUT CANCELADO"}
        </span>

        <h1>
          {isSuccess
            ? isPremium
              ? "Bem-vindo ao Premium"
              : "Assinatura em processamento"
            : "Você ainda pode assinar quando quiser"}
        </h1>

        <p>{message}</p>

        {isSuccess && (
          <div className="billing-result-benefits">
            <strong>{isPremium ? "Agora você tem:" : "Quando confirmado, você terá:"}</strong>
            <ul>
              {UNLOCKED_BENEFITS.map((item) => (
                <li key={item}>
                  <Check size={15} aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {!isSuccess && (
          <div className="billing-result-teaser">
            <span className="billing-result-teaser-badge">
              <Crown size={14} aria-hidden="true" />
              Premium
            </span>
            <p>
              {PREMIUM_VALUE_PROPS[0].title}: {PREMIUM_VALUE_PROPS[0].description}
            </p>
            <ul className="billing-trust-row">
              {CHECKOUT_TRUST_ITEMS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="billing-result-steps">
          <strong>Próximos passos</strong>
          <ol>
            {isSuccess ? (
              <>
                <li>Abra Plano e metas para ver seu uso diário.</li>
                <li>Escolha um cenário e pratique com mais conversas e voz.</li>
                <li>Cancele quando quiser no perfil — o acesso continua até o fim do ciclo.</li>
              </>
            ) : (
              <>
                <li>Compare Free e Premium na página de planos.</li>
                <li>Escolha mensal ou anual e pague com cartão ou PIX.</li>
                <li>O Premium é liberado após a confirmação do pagamento.</li>
              </>
            )}
          </ol>
        </div>

        <div className="billing-result-actions">
          {isSuccess ? (
            <>
              <Button onClick={() => go("scenarios")} disabled={!ready} icon={<ArrowRight size={16} />}>
                Começar a praticar
              </Button>
              <Button variant="secondary" onClick={() => go("profile")} disabled={!ready}>
                Ver Plano e metas
              </Button>
            </>
          ) : (
            <>
              <Button onClick={() => go("pricing")}>Ver planos Premium</Button>
              <Button variant="secondary" onClick={() => go("dashboard")}>
                Voltar ao início
              </Button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
