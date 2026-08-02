"use client";

import { Check, ChevronDown, Plus } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useLearnerOptional } from "@/lib/learner-context";
import {
  languageDetails,
  levelLabels,
  shortLevel,
  type TargetLanguage,
} from "@/lib/learner";

const allLanguages = Object.keys(languageDetails) as TargetLanguage[];

export function LanguageSwitcher() {
  const learner = useLearnerOptional();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<TargetLanguage | null>(null);
  const [adding, setAdding] = useState<TargetLanguage | null>(null);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  const preferences = learner?.preferences;
  const studiedLanguages = learner?.studiedLanguages || [];
  const activeLanguage = preferences?.targetLanguage || studiedLanguages[0]?.targetLanguage || "en";
  const activeDetails = languageDetails[activeLanguage];
  const studiedSet = new Set(studiedLanguages.map((item) => item.targetLanguage));
  const availableToAdd = allLanguages.filter((language) => !studiedSet.has(language));

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const chooseLanguage = async (language: TargetLanguage) => {
    if (!learner || language === activeLanguage) {
      setOpen(false);
      return;
    }
    setSwitching(language);
    const result = await learner.switchLanguage(language);
    setSwitching(null);
    if (!result.error) setOpen(false);
  };

  const chooseNewLanguage = async (language: TargetLanguage) => {
    if (!learner) return;
    setAdding(language);
    const result = await learner.addLanguage(language, "unknown");
    setAdding(null);
    if (!result.error) {
      await learner.switchLanguage(language);
      setOpen(false);
    }
  };

  if (!learner || studiedLanguages.length === 0) {
    return (
      <button
        type="button"
        className="language-switch"
        title="Idioma estudado"
        aria-label={`Idioma estudado: ${activeDetails.name}`}
      >
        <span>{activeDetails.flag}</span> {activeDetails.name}
      </button>
    );
  }

  return (
    <div className="language-switcher" ref={rootRef}>
      <button
        type="button"
        className="language-switch"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">{activeDetails.flag}</span>
        <span className="language-switch-label">{activeDetails.name}</span>
        <ChevronDown aria-hidden="true" className={open ? "open" : ""} size={16} />
      </button>
      {open && (
        <div id={panelId} className="language-panel" role="listbox" aria-label="Idiomas que você estuda">
          <header>
            <strong>Seus idiomas</strong>
            <small>Toque para trocar e continuar no nível certo</small>
          </header>
          {studiedLanguages.map((entry) => {
            const details = languageDetails[entry.targetLanguage];
            const active = entry.targetLanguage === activeLanguage;
            const busy = switching === entry.targetLanguage;
            return (
              <button
                key={entry.targetLanguage}
                type="button"
                role="option"
                aria-selected={active}
                className={active ? "active" : ""}
                disabled={Boolean(switching || adding)}
                onClick={() => void chooseLanguage(entry.targetLanguage)}
              >
                <span className="language-panel-flag" aria-hidden="true">
                  {details.flag}
                </span>
                <span className="language-panel-copy">
                  <strong>{details.name}</strong>
                  <small>{levelLabels[entry.currentLevel]}</small>
                </span>
                {active ? (
                  <Check aria-hidden="true" size={18} />
                ) : (
                  <span className="language-panel-level">{shortLevel(entry.currentLevel)}</span>
                )}
                {busy && <span className="language-panel-busy">Trocando…</span>}
              </button>
            );
          })}
          {availableToAdd.length > 0 && (
            <div className="language-panel-add">
              <p>Adicionar idioma</p>
              <div className="language-panel-add-grid">
                {availableToAdd.map((language) => {
                  const details = languageDetails[language];
                  const busy = adding === language;
                  return (
                    <button
                      key={language}
                      type="button"
                      disabled={Boolean(switching || adding)}
                      onClick={() => void chooseNewLanguage(language)}
                    >
                      <Plus aria-hidden="true" size={14} />
                      <span aria-hidden="true">{details.flag}</span>
                      {details.name}
                      {busy && "…"}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
