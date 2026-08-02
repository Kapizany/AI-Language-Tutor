"use client";

import { Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui";

type UpgradePromptProps = {
  title: string;
  message: string;
  onUpgrade: () => void;
  compact?: boolean;
  ctaLabel?: string;
  highlights?: readonly string[];
};

export function UpgradePrompt({
  title,
  message,
  onUpgrade,
  compact = false,
  ctaLabel = "Conhecer Premium",
  highlights,
}: UpgradePromptProps) {
  return (
    <aside className={`upgrade-prompt${compact ? " compact" : ""}`}>
      <div className="upgrade-prompt-copy">
        <span className="upgrade-prompt-badge">
          <Sparkles size={14} aria-hidden="true" />
          Premium
        </span>
        <strong>{title}</strong>
        <p>{message}</p>
        {highlights && highlights.length > 0 && (
          <ul className="upgrade-prompt-highlights">
            {highlights.map((item) => (
              <li key={item}>
                <Check size={13} aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        )}
      </div>
      <Button onClick={onUpgrade}>{ctaLabel}</Button>
    </aside>
  );
}
