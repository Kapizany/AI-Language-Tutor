"use client";

import { Bell, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { languageDetails, type LearnerPreferences, type ScreenId } from "@/lib/learner";

export function AppHeader({
  title,
  subtitle,
  displayName,
  preferences,
  onNavigate,
}: {
  title: string;
  subtitle?: string;
  displayName?: string;
  preferences?: LearnerPreferences | null;
  onNavigate?: (screen: ScreenId) => void;
}) {
  const language = preferences ? languageDetails[preferences.targetLanguage] : languageDetails.en;
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
      detail: `Reserve ${preferences?.studyMinutesPerDay || 20} minutos para uma atividade.`,
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
      detail: "Você tem três conversas por dia para praticar com o tutor.",
      screen: "scenarios",
    },
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
        <button
          className="language-switch"
          onClick={() => onNavigate?.("profile")}
          title="Trocar o idioma estudado nas configurações"
        >
          <span>{language.flag}</span> {language.name}
        </button>
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
