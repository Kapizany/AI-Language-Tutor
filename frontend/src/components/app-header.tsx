"use client";

import { Bell, ChevronRight, Crown, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { LanguageSwitcher } from "@/components/language-switcher";
import { planLabel } from "@/lib/entitlements";
import { useLearnerOptional } from "@/lib/learner-context";
import { languageDetails, type ScreenId } from "@/lib/learner";

export function AppHeader({
  title,
  subtitle,
  displayName,
  onNavigate,
}: {
  title: string;
  subtitle?: string;
  displayName?: string;
  onNavigate?: (screen: ScreenId) => void;
}) {
  const learner = useLearnerOptional();
  const language = learner?.preferences
    ? languageDetails[learner.preferences.targetLanguage]
    : languageDetails.en;
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [readNotifications, setReadNotifications] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = JSON.parse(window.localStorage.getItem("lume:read-notifications") || "[]");
      return Array.isArray(stored)
        ? stored.filter((item): item is string => typeof item === "string")
        : [];
    } catch {
      return [];
    }
  });
  const notifications: Array<{ id: string; title: string; detail: string; screen: ScreenId }> = [
    {
      id: "daily-goal",
      title: "Sua meta diária está esperando",
      detail: `Reserve ${learner?.preferences?.studyMinutesPerDay || 20} minutos para uma atividade.`,
      screen: "learn",
    },
    {
      id: "review",
      title: "Revisão disponível",
      detail: `Pratique os cartões de ${language.name} e fortaleça sua memória.`,
      screen: "vocabulary",
    },
    {
      id: "conversation",
      title: "Continue conversando",
      detail: "Você tem duas conversas por dia para praticar com o tutor.",
      screen: "scenarios",
    },
    ...(learner?.planId !== "premium"
      ? [{
          id: "premium-offer",
          title: "Desbloqueie mais prática",
          detail: "Premium por R$ 5,00 durante a validação temporária da cobrança.",
          screen: "pricing" as ScreenId,
        }]
      : []),
  ];
  const unreadCount = notifications.filter((item) => !readNotifications.includes(item.id)).length;

  useEffect(() => {
    window.localStorage.setItem("lume:read-notifications", JSON.stringify(readNotifications));
  }, [readNotifications]);

  const openNotification = (id: string, screen: ScreenId) => {
    setReadNotifications((current) => (current.includes(id) ? current : [...current, id]));
    setNotificationsOpen(false);
    onNavigate?.(screen);
  };

  const openProfile = () => {
    if (onNavigate) {
      onNavigate("profile");
      return;
    }
    window.history.pushState(null, "", "#/profile");
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  return (
    <header className="app-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="app-header-tools">
        {learner && learner.planId !== "premium" && (
          <button
            type="button"
            className="plan-badge"
            onClick={() => learner.goToPricing()}
            title="Ver plano Premium"
          >
            <Crown size={14} aria-hidden="true" />
            {planLabel(learner.planId)}
          </button>
        )}
        <LanguageSwitcher />
        {learner?.isAdmin && onNavigate && (
          <button
            type="button"
            className="icon-button admin-shortcut"
            title="Painel administrativo"
            aria-label="Abrir painel administrativo"
            onClick={() => onNavigate("admin")}
          >
            <ShieldCheck size={20} />
          </button>
        )}
        <div className="notification-center">
          <button
            className="icon-button"
            title="Notificações"
            aria-label={`Notificações: ${unreadCount} não lidas`}
            aria-expanded={notificationsOpen}
            onClick={() => setNotificationsOpen((open) => !open)}
          >
            <Bell size={20} />
            {unreadCount > 0 && <i>{unreadCount}</i>}
          </button>
          {notificationsOpen && (
            <div className="notification-panel">
              <header>
                <strong>Notificações</strong>
                {unreadCount > 0 && (
                  <button onClick={() => setReadNotifications(notifications.map(({ id }) => id))}>
                    Marcar como lidas
                  </button>
                )}
              </header>
              {notifications.map((item) => (
                <button
                  key={item.id}
                  className={readNotifications.includes(item.id) ? "read" : ""}
                  onClick={() => openNotification(item.id, item.screen)}
                >
                  <span />
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                  </div>
                  <ChevronRight />
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          className="user-avatar"
          type="button"
          title="Meu perfil"
          aria-label="Abrir meu perfil"
          onClick={openProfile}
        >
          {(displayName || "Aluno").slice(0, 2).toUpperCase()}
        </button>
      </div>
    </header>
  );
}
