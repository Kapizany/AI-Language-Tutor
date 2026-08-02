"use client";

import { Check, Minus } from "lucide-react";

import {
  formatMultiplier,
  PLAN_COMPARISON,
  PLAN_FEATURE_GROUPS,
  type PlanTier,
} from "@/lib/pricing";

type PlanComparisonProps = {
  variant?: "full" | "compact";
  currentPlan?: PlanTier;
  highlightColumn?: PlanTier;
  showPremiumOnly?: boolean;
};

function BooleanCell({ value }: { value: boolean }) {
  return value ? (
    <span className="plan-cell-yes" aria-label="Incluído">
      <Check size={16} aria-hidden="true" />
    </span>
  ) : (
    <span className="plan-cell-no" aria-label="Não incluído">
      <Minus size={16} aria-hidden="true" />
    </span>
  );
}

function LimitCell({ value, highlight }: { value: number | boolean; highlight?: boolean }) {
  if (typeof value === "boolean") {
    return <BooleanCell value={value} />;
  }
  return (
    <span className={highlight ? "plan-cell-highlight" : undefined}>
      {value.toLocaleString("pt-BR")}
    </span>
  );
}

export function PlanComparison({
  variant = "full",
  currentPlan,
  highlightColumn = "premium",
  showPremiumOnly = false,
}: PlanComparisonProps) {
  const freeLabel = currentPlan === "free" ? "Seu plano" : "Free";
  const premiumLabel = currentPlan === "premium" ? "Seu plano" : "Premium";

  return (
    <div className={`plan-comparison plan-comparison-${variant}${variant === "compact" ? " plan-comparison-compact" : ""}`}>
      {variant === "full" && (
        <header className="plan-comparison-header">
          <h3>Compare plano a plano</h3>
          <p>Limites diários em linguagem de estudo — o que muda na prática.</p>
        </header>
      )}

      <div className="plan-comparison-table" role="table" aria-label="Comparação Free e Premium">
        <div className="plan-comparison-row plan-comparison-head" role="row">
          <span role="columnheader">Recurso</span>
          {!showPremiumOnly && (
            <span
              role="columnheader"
              data-label={freeLabel}
              className={highlightColumn === "free" ? "is-featured" : undefined}
            >
              {freeLabel}
            </span>
          )}
          <span
            role="columnheader"
            data-label={premiumLabel}
            className={highlightColumn === "premium" ? "is-featured" : undefined}
          >
            {premiumLabel}
          </span>
        </div>

        {PLAN_FEATURE_GROUPS.map((group) => (
          <div key={group.title} className="plan-comparison-group">
            {variant === "full" && (
              <div className="plan-comparison-group-title" role="row">
                <span role="cell">{group.title}</span>
              </div>
            )}
            {group.features.map((feature) => {
              const isBooleanFeature = "boolean" in feature && feature.boolean === true;
              const multiplier =
                !isBooleanFeature &&
                typeof feature.free === "number" &&
                typeof feature.premium === "number"
                  ? formatMultiplier(feature.free, feature.premium)
                  : null;

              return (
                <div
                  key={feature.label}
                  className={`plan-comparison-row${"highlight" in feature && feature.highlight ? " is-highlight" : ""}`}
                  role="row"
                >
                  <span role="cell" className="plan-feature-label">
                    <strong>{feature.label}</strong>
                    {"hint" in feature && feature.hint && variant === "full" && (
                      <small>{feature.hint}</small>
                    )}
                  </span>
                  {!showPremiumOnly && (
                    <span role="cell" data-label={freeLabel}>
                      <LimitCell
                        value={isBooleanFeature ? feature.free : feature.free}
                        highlight={highlightColumn === "free"}
                      />
                    </span>
                  )}
                  <span
                    role="cell"
                    data-label={premiumLabel}
                    className={highlightColumn === "premium" ? "is-featured-cell" : undefined}
                  >
                    <LimitCell
                      value={isBooleanFeature ? feature.premium : feature.premium}
                      highlight={highlightColumn === "premium"}
                    />
                    {multiplier && variant === "full" && highlightColumn === "premium" && (
                      <em className="plan-multiplier">{multiplier}</em>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {variant === "compact" && currentPlan === "free" && (
        <p className="plan-comparison-footnote">
          Premium libera até {PLAN_COMPARISON.premium.conversationSessions} conversas e{" "}
          {PLAN_COMPARISON.premium.messagesPerSession} mensagens por sessão por dia.
        </p>
      )}
    </div>
  );
}
