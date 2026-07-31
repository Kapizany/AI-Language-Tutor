"use client";

import { ArrowRight, CheckCircle2, Clock3, MessageCircle, Sparkles } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { categoryLabels, renderScenarioIcon } from "@/components/scenario-icons";
import { Button } from "@/components/ui";
import {
  loadSessionHistory,
  type ScenarioCatalogItem,
  type SessionHistoryEntry,
} from "@/lib/conversation";
import { languageDetails, type LearnerPreferences, type ScreenId } from "@/lib/learner";
import { getSupabaseBrowserClient } from "@/lib/supabase";

const statusLabels: Record<SessionHistoryEntry["status"], string> = {
  active: "Em andamento",
  completed: "Concluída",
  abandoned: "Encerrada sem resumo",
};

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function durationLabel(entry: SessionHistoryEntry) {
  if (!entry.endedAt) return null;
  const minutes = Math.max(
    1,
    Math.round((Date.parse(entry.endedAt) - Date.parse(entry.startedAt)) / 60_000),
  );
  return `${minutes} min`;
}

export function SessionHistory({
  displayName,
  preferences,
  session,
  scenarios,
  go,
  resumeScenario,
}: {
  displayName: string;
  preferences: LearnerPreferences | null;
  session: Session | null;
  scenarios: ScenarioCatalogItem[];
  go: (screen: ScreenId) => void;
  resumeScenario: (scenario: ScenarioCatalogItem) => void;
}) {
  const [entries, setEntries] = useState<SessionHistoryEntry[] | null>(null);
  const [error, setError] = useState(
    session ? "" : "A conexão com o histórico ainda não está configurada.",
  );
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !session) {
      return;
    }
    let active = true;
    const load = async () => {
      setError("");
      try {
        const history = await loadSessionHistory(supabase, session.user.id);
        if (active) setEntries(history);
      } catch {
        if (active) setError("Não foi possível carregar seu histórico de conversas.");
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [session]);

  const scenarioById = new Map(scenarios.map((scenario) => [scenario.id, scenario]));

  return (
    <div className="screen-content">
      <AppHeader
        title="Suas conversas"
        subtitle="Todo o histórico das suas práticas com o tutor."
        displayName={displayName}
        preferences={preferences}
        onNavigate={go}
      />

      {error && (
        <div className="form-message form-error" role="alert">
          {error}
        </div>
      )}

      {!entries && !error && (
        <div className="learning-loading">
          <Sparkles />
          <p>Carregando seu histórico...</p>
        </div>
      )}

      {entries && entries.length === 0 && (
        <div className="learning-loading">
          <MessageCircle />
          <p>Você ainda não conversou com o tutor. Escolha um cenário para começar.</p>
          <Button onClick={() => go("scenarios")}>Escolher cenário</Button>
        </div>
      )}

      {entries && entries.length > 0 && (
        <section className="session-history">
          {entries.map((entry) => {
            const scenario = scenarioById.get(entry.scenarioId);
            const duration = durationLabel(entry);
            const isOpen = expanded === entry.sessionId;
            return (
              <article key={entry.sessionId} className={`session-row status-${entry.status}`}>
                <span className={`scenario-art ${scenario?.accent || "teal"}`}>
                  {renderScenarioIcon(scenario?.icon || "")}
                </span>
                <div className="session-row-copy">
                  <span className="session-row-meta">
                    {scenario ? categoryLabels[scenario.category] : "Conversa"} ·{" "}
                    {languageDetails[entry.targetLanguage].name} ·{" "}
                    {dateFormatter.format(new Date(entry.startedAt))}
                  </span>
                  <h3>{scenario?.title || entry.scenarioId}</h3>
                  <div className="session-row-facts">
                    <span>
                      <MessageCircle size={14} /> {entry.learnerMessageCount}{" "}
                      {entry.learnerMessageCount === 1 ? "mensagem" : "mensagens"}
                    </span>
                    <span>
                      <CheckCircle2 size={14} /> {entry.correctionCount}{" "}
                      {entry.correctionCount === 1 ? "correção" : "correções"}
                    </span>
                    {duration && (
                      <span>
                        <Clock3 size={14} /> {duration}
                      </span>
                    )}
                    <span className="session-status">{statusLabels[entry.status]}</span>
                  </div>
                  {isOpen && entry.summary && (
                    <div className="session-summary-detail">
                      <strong>{entry.summary.headline_pt_br}</strong>
                      <p>{entry.summary.encouragement_pt_br}</p>
                      <div className="session-summary-columns">
                        <div>
                          <h4>Pontos fortes</h4>
                          <ul>
                            {entry.summary.strengths_pt_br.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </div>
                        {entry.summary.focus_areas.length > 0 && (
                          <div>
                            <h4>Para melhorar</h4>
                            <ul>
                              {entry.summary.focus_areas.map((item) => (
                                <li key={item.title_pt_br}>
                                  <strong>{item.title_pt_br}</strong> {item.detail_pt_br}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {entry.summary.vocabulary.length > 0 && (
                          <div>
                            <h4>Vocabulário</h4>
                            <ul>
                              {entry.summary.vocabulary.map((item) => (
                                <li key={item.term}>
                                  <strong>{item.term}</strong> — {item.translation_pt_br}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                      <small>Objetivo cumprido: {entry.summary.objective_progress}%</small>
                    </div>
                  )}
                  {isOpen && (
                    <div className="session-transcript">
                      <h4>Transcrição</h4>
                      {entry.messages.map((message) => (
                        <div
                          key={`${entry.sessionId}-${message.sequence}`}
                          className={message.role === "learner" ? "learner" : "tutor"}
                        >
                          <strong>{message.role === "learner" ? "Você" : "Lume"}</strong>
                          <p>{message.content}</p>
                          {message.correction && (
                            <small>
                              Correção: {message.correction.corrected} —{" "}
                              {message.correction.explanation_pt_br}
                            </small>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="session-row-actions">
                  <button onClick={() => setExpanded(isOpen ? null : entry.sessionId)}>
                    {isOpen ? "Ocultar detalhes" : "Ver conversa"}
                  </button>
                  {entry.status === "active" && scenario && (
                    <Button onClick={() => resumeScenario(scenario)} icon={<ArrowRight size={15} />}>
                      Retomar
                    </Button>
                  )}
                  {entry.status === "abandoned" && !entry.summary && (
                    <small>Sem resumo: a conversa foi encerrada antes do fim.</small>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
