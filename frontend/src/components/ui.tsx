"use client";

import { Sparkles } from "lucide-react";

export function Brand({ compact = false, onClick }: { compact?: boolean; onClick?: () => void }) {
  return (
    <button className="brand" aria-label="Ir para início" data-compact={compact} onClick={onClick}>
      <span className="brand-mark">
        <Sparkles size={compact ? 17 : 20} />
      </span>
      {!compact && <span>Lume</span>}
    </button>
  );
}

export function Button({
  children,
  variant = "primary",
  icon,
  onClick,
  type = "button",
  full = false,
  disabled = false,
  title,
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "dark" | "danger";
  icon?: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  full?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type={type}
      className={`button button-${variant}${full ? " button-full" : ""}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
      {icon}
    </button>
  );
}

export function ProgressRing({ value, label }: { value: number; label: string }) {
  const safeValue = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      className="progress-ring"
      role="img"
      aria-label={`${safeValue}% ${label}`}
      style={{ "--progress": `${safeValue * 3.6}deg` } as React.CSSProperties}
    >
      <div>
        <strong>{safeValue}%</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

export function Stat({
  icon,
  value,
  label,
  tone = "teal",
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  tone?: "teal" | "coral" | "amber" | "blue";
}) {
  return (
    <div className={`stat stat-${tone}`}>
      <span className="stat-icon">{icon}</span>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}
