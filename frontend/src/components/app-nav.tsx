"use client";

import {
  BarChart3,
  GraduationCap,
  History,
  Home,
  LogIn,
  Map,
  MessageCircle,
  MoreHorizontal,
  RotateCcw,
  Settings,
  X,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Brand } from "@/components/ui";
import type { IconType, ScreenId } from "@/lib/learner";

type NavItem = {
  id: ScreenId;
  label: string;
  shortLabel: string;
  icon: IconType;
};

const primaryNav: NavItem[] = [
  { id: "dashboard", label: "Início", shortLabel: "Início", icon: Home },
  { id: "learn", label: "Aprender", shortLabel: "Aprender", icon: GraduationCap },
  { id: "scenarios", label: "Conversar", shortLabel: "Conversar", icon: MessageCircle },
];

const secondaryNav: NavItem[] = [
  { id: "plan", label: "Minha rotina", shortLabel: "Rotina", icon: Map },
  { id: "sessions", label: "Histórico", shortLabel: "Histórico", icon: History },
  { id: "vocabulary", label: "Revisar", shortLabel: "Revisar", icon: RotateCcw },
  { id: "progress", label: "Progresso", shortLabel: "Progresso", icon: BarChart3 },
];

const menuScreens = new Set<ScreenId>([
  ...secondaryNav.map((item) => item.id),
  "profile",
]);

function NavIcon({ icon: Icon }: { icon: IconType }) {
  return <Icon aria-hidden size={20} />;
}

export function AppNav({
  current,
  go,
  displayName,
  signOut,
}: {
  current: ScreenId;
  go: (id: ScreenId) => void;
  displayName: string;
  signOut: () => Promise<void>;
}) {
  const firstName = displayName.trim().split(/\s+/)[0] || "Aluno";
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const previousFocus = menuButtonRef.current;
    const panel = menuPanelRef.current;
    const focusable = panel?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    focusable?.[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false);
        previousFocus?.focus();
        return;
      }
      if (event.key !== "Tab" || !focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [menuOpen]);

  const navigate = (id: ScreenId) => {
    setMenuOpen(false);
    go(id);
  };

  const renderNavButton = (item: NavItem, compact = false) => {
    const active = current === item.id;
    return (
      <button
        key={item.id}
        type="button"
        className={active ? "active" : ""}
        aria-current={active ? "page" : undefined}
        onClick={() => navigate(item.id)}
      >
        <NavIcon icon={item.icon} />
        <span>{compact ? item.shortLabel : item.label}</span>
      </button>
    );
  };

  return (
    <>
      <aside className="app-sidebar" aria-label="Navegação principal">
        <Brand onClick={() => go("dashboard")} />
        <nav aria-label="Estudo">
          <p className="nav-section-label">Estudo</p>
          {primaryNav.map((item) => renderNavButton(item))}
        </nav>
        <nav aria-label="Acompanhamento">
          <p className="nav-section-label">Acompanhamento</p>
          {secondaryNav.map((item) => renderNavButton(item))}
        </nav>
        <div className="sidebar-bottom">
          <button type="button" onClick={() => go("profile")} aria-current={current === "profile" ? "page" : undefined}>
            <Settings aria-hidden="true" focusable="false" />
            <span>Configurações</span>
          </button>
          <div className="mini-profile">
            <button
              type="button"
              className="mini-profile-link"
              onClick={() => go("profile")}
              aria-label={`Abrir perfil de ${firstName}`}
            >
              <span aria-hidden="true">{firstName.slice(0, 2).toUpperCase()}</span>
              <div>
                <strong>{firstName}</strong>
                <small>Meu perfil</small>
              </div>
            </button>
            <button
              type="button"
              className="signout-button"
              onClick={signOut}
              aria-label="Sair da conta"
            >
              <LogIn aria-hidden="true" focusable="false" />
            </button>
          </div>
        </div>
      </aside>

      <nav className="mobile-nav" aria-label="Navegação principal">
        {primaryNav.map((item) => renderNavButton(item, true))}
        <button
          ref={menuButtonRef}
          type="button"
          className={menuScreens.has(current) || menuOpen ? "active" : ""}
          aria-expanded={menuOpen}
          aria-controls={menuId}
          aria-haspopup="dialog"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <MoreHorizontal aria-hidden="true" focusable="false" />
          <span>Menu</span>
        </button>
      </nav>

      {menuOpen && (
        <div className="mobile-menu-layer" role="presentation">
          <button
            type="button"
            className="mobile-menu-backdrop"
            aria-label="Fechar menu"
            onClick={() => setMenuOpen(false)}
          />
          <div
            ref={menuPanelRef}
            id={menuId}
            className="mobile-menu-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Mais opções"
          >
            <header className="mobile-menu-head">
              <strong>Mais opções</strong>
              <button type="button" onClick={() => setMenuOpen(false)} aria-label="Fechar menu">
                <X aria-hidden="true" focusable="false" />
              </button>
            </header>
            <div className="mobile-menu-grid">
              {secondaryNav.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={current === item.id ? "active" : ""}
                  aria-current={current === item.id ? "page" : undefined}
                  onClick={() => navigate(item.id)}
                >
                  <NavIcon icon={item.icon} />
                  <span>{item.label}</span>
                </button>
              ))}
              <button
                type="button"
                className={current === "profile" ? "active" : ""}
                aria-current={current === "profile" ? "page" : undefined}
                onClick={() => navigate("profile")}
              >
                <Settings aria-hidden="true" focusable="false" />
                <span>Configurações</span>
              </button>
              <button type="button" className="mobile-menu-signout" onClick={() => void signOut()} aria-label="Sair da conta">
                <LogIn aria-hidden="true" focusable="false" />
                <span>Sair da conta</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
