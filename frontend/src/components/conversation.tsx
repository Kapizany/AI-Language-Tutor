"use client";

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Languages,
  Mic2,
  RotateCcw,
  Sparkles,
  Volume2,
  X,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, ProgressRing } from "@/components/ui";
import { renderScenarioIcon } from "@/components/scenario-icons";
import {
  abandonConversation,
  ConversationApiError,
  completeConversation,
  formatElapsed,
  readConversation,
  sendConversationMessage,
  sessionProgressPercent,
  startConversation,
  type ConversationMessage,
  type ConversationSession,
  type ScenarioCatalogItem,
  type SessionSummary,
} from "@/lib/conversation";
import { shortLevel, tutorLevel, type LearnerPreferences } from "@/lib/learner";

export type CompletedConversationView = {
  sessionId: string;
  scenario: ScenarioCatalogItem;
  summary: SessionSummary;
  elapsedSeconds: number;
  messageCount: number;
  learnerMessageCount: number;
  correctionCount: number;
};

const severityLabels: Record<string, string> = {
  minor: "Um ajuste pequeno",
  important: "Vale tentar de novo",
  blocking: "Precisa reformular",
};

export function Conversation({
  scenario,
  preferences,
  session,
  goBack,
  onCompleted,
}: {
  scenario: ScenarioCatalogItem;
  preferences: LearnerPreferences | null;
  session: Session | null;
  goBack: () => void;
  onCompleted: (completed: CompletedConversationView) => void;
}) {
  const accessToken = session?.access_token || "";
  const targetLanguage = preferences?.targetLanguage || "en";
  const learnerLevel = tutorLevel(preferences?.currentLevel);

  const [conversation, setConversation] = useState<ConversationSession | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [startupError, setStartupError] = useState(
    accessToken ? "" : "Sua sessão expirou. Entre novamente para conversar.",
  );
  const [answer, setAnswer] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [retryText, setRetryText] = useState("");
  const [ending, setEnding] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  // `start_conversation_session` retoma uma sessão ativa do mesmo cenário e
  // idioma, então abrir a tela de novo continua a conversa em vez de gastar
  // outra das três sessões diárias.
  useEffect(() => {
    if (!accessToken) {
      return;
    }
    const controller = new AbortController();
    let active = true;
    const begin = async () => {
      setStartupError("");
      try {
        const started = await startConversation(
          accessToken,
          { scenarioId: scenario.id, targetLanguage, learnerLevel },
          controller.signal,
        );
        if (!active) return;
        setConversation(started);
        setMessages(started.messages);
      } catch (error) {
        if (!active || controller.signal.aborted) return;
        setStartupError(
          error instanceof ConversationApiError
            ? error.message
            : "Não foi possível abrir a conversa agora.",
        );
      }
    };
    void begin();
    return () => {
      active = false;
      controller.abort();
    };
  }, [accessToken, learnerLevel, scenario.id, targetLanguage]);

  // O cronômetro parte de `started_at` gravado no banco, então recarregar a
  // página não zera o tempo da sessão.
  useEffect(() => {
    if (!conversation) return;
    const startedAt = Date.parse(conversation.started_at);
    if (Number.isNaN(startedAt)) return;
    const tick = () => setElapsedSeconds(Math.max(0, (Date.now() - startedAt) / 1000));
    tick();
    const timer = window.setInterval(tick, 1_000);
    return () => window.clearInterval(timer);
  }, [conversation]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight });
  }, [messages, sending]);

  const resync = useCallback(async () => {
    if (!conversation || !accessToken) return;
    try {
      const refreshed = await readConversation(accessToken, conversation.session_id);
      setConversation(refreshed);
      setMessages(refreshed.messages);
    } catch {
      // Falha ao ressincronizar não deve derrubar a tela; o aluno continua
      // vendo o que já está carregado.
    }
  }, [accessToken, conversation]);

  const learnerMessageCount = conversation?.learner_message_count ?? 0;
  const maxLearnerMessages = conversation?.max_learner_messages ?? 0;
  const reachedMessageLimit = Boolean(conversation) && learnerMessageCount >= maxLearnerMessages;
  const remainingMessages = Math.max(0, maxLearnerMessages - learnerMessageCount);

  const send = async (text: string) => {
    if (!conversation || !accessToken || sending) return;
    const trimmed = text.trim();
    if (!trimmed || reachedMessageLimit) return;

    const controller = new AbortController();
    abortRef.current = controller;
    const optimistic: ConversationMessage = {
      sequence: (messages.at(-1)?.sequence ?? 0) + 1,
      role: "learner",
      content: trimmed,
    };
    setMessages((current) => [...current, optimistic]);
    setAnswer("");
    setSendError("");
    setRetryText("");
    setSending(true);

    try {
      // Cada tentativa usa um `request_id` novo: o anterior já foi finalizado na
      // contabilidade de custo e seria recusado como duplicado.
      const result = await sendConversationMessage(
        accessToken,
        conversation.session_id,
        { message: trimmed, requestId: crypto.randomUUID() },
        controller.signal,
      );
      setMessages((current) => [
        ...current.filter((message) => message !== optimistic),
        { ...optimistic, sequence: result.learner_sequence },
        {
          sequence: result.tutor_sequence,
          role: "tutor",
          content: result.result.reply,
          correction: result.result.correction,
        },
      ]);
      setConversation((current) =>
        current
          ? {
              ...current,
              learner_message_count: result.learner_message_count,
              max_learner_messages: result.max_learner_messages,
            }
          : current,
      );
    } catch (error) {
      setMessages((current) => current.filter((message) => message !== optimistic));
      if (controller.signal.aborted) {
        setSendError("Geração cancelada.");
        setRetryText(trimmed);
        // A requisição pode ter sido concluída no servidor depois do cancelamento,
        // então relemos o estado real em vez de adivinhar.
        await resync();
      } else {
        setSendError(
          error instanceof ConversationApiError
            ? error.message
            : "Não foi possível enviar sua mensagem.",
        );
        setRetryText(trimmed);
        if (error instanceof ConversationApiError && error.status === 409) await resync();
      }
    } finally {
      abortRef.current = null;
      setSending(false);
    }
  };

  const cancelGeneration = () => abortRef.current?.abort();

  const endSession = async () => {
    if (!conversation || !accessToken || ending) return;
    setEnding(true);
    setSendError("");
    try {
      const completed = await completeConversation(accessToken, conversation.session_id);
      onCompleted({
        sessionId: conversation.session_id,
        scenario,
        summary: completed.summary,
        elapsedSeconds: Math.round(elapsedSeconds),
        messageCount: messages.length,
        learnerMessageCount: conversation.learner_message_count,
        correctionCount: messages.filter((message) => message.correction).length,
      });
    } catch (error) {
      setSendError(
        error instanceof ConversationApiError
          ? error.message
          : "Não foi possível encerrar a conversa agora.",
      );
      setEnding(false);
    }
  };

  const leaveWithoutSummary = async () => {
    if (conversation && accessToken && conversation.learner_message_count === 0) {
      // Sem nenhuma fala do aluno, encerrar a sessão devolve a vaga do dia.
      await abandonConversation(accessToken, conversation.session_id).catch(() => undefined);
    }
    goBack();
  };

  if (startupError) {
    return (
      <div className="conversation-screen">
        <header className="conversation-header">
          <button onClick={goBack} aria-label="Voltar para os cenários">
            <ArrowLeft />
          </button>
          <div className="conversation-title">
            <strong>{scenario.title}</strong>
          </div>
        </header>
        <main className="conversation-body conversation-empty">
          <div className="form-message form-error" role="alert">
            {startupError}
          </div>
          <Button onClick={goBack} icon={<ArrowLeft size={17} />}>
            Escolher outro cenário
          </Button>
        </main>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="conversation-screen">
        <main className="conversation-body conversation-empty">
          <Sparkles />
          <p>Abrindo sua conversa...</p>
        </main>
      </div>
    );
  }

  const progress = sessionProgressPercent(
    conversation.learner_message_count,
    conversation.planned_minutes,
    conversation.max_learner_messages,
  );
  const overPlannedTime = elapsedSeconds > conversation.planned_minutes * 60;

  return (
    <div className="conversation-screen">
      <header className="conversation-header">
        <button onClick={() => void leaveWithoutSummary()} aria-label="Voltar para os cenários">
          <ArrowLeft />
        </button>
        <div className="conversation-title">
          <span className="mini-avatar">Lu</span>
          <div>
            <strong>{scenario.title}</strong>
            <small>
              <i /> Lume · {shortLevel(preferences?.currentLevel || "unknown")}
            </small>
          </div>
        </div>
        <div className={`session-timer${overPlannedTime ? " session-timer-over" : ""}`}>
          <Clock3 />
          <span aria-label="Tempo de conversa">{formatElapsed(elapsedSeconds)}</span>
          <small>de {conversation.planned_minutes} min</small>
        </div>
        <Button variant="ghost" onClick={() => void endSession()} disabled={ending || sending}>
          {ending ? "Encerrando..." : "Encerrar"}
        </Button>
      </header>

      <main className="conversation-body">
        <div className="conversation-context">
          {renderScenarioIcon(scenario.icon)}
          <div>
            <span>SEU OBJETIVO</span>
            <strong>{scenario.objective}</strong>
          </div>
          {conversation.resumed && <span className="resumed-chip">Conversa retomada</span>}
        </div>

        <div className="conversation-messages" ref={transcriptRef}>
          <div className="time-divider">
            <span>Início da prática</span>
          </div>
          {messages.map((message) => (
            <div key={`${message.role}-${message.sequence}`}>
              <div
                className={`chat-message ${message.role === "learner" ? "user-message" : "tutor-message"}`}
              >
                {message.role === "tutor" && <div className="mini-avatar">Lu</div>}
                <div>
                  <span>{message.content}</span>
                </div>
              </div>
              {message.correction && (
                <div className="inline-feedback compact-feedback">
                  <div className="feedback-title">
                    <CheckCircle2 />
                    <strong>{severityLabels[message.correction.severity] || "Uma correção"}</strong>
                  </div>
                  <div className="compare">
                    <del>{message.correction.original}</del>
                    <ArrowRight size={15} />
                    <ins>{message.correction.corrected}</ins>
                  </div>
                  <p>{message.correction.explanation_pt_br}</p>
                </div>
              )}
            </div>
          ))}
          {sending && (
            <div className="chat-message tutor-message typing-indicator">
              <div className="mini-avatar">Lu</div>
              <div>
                <span aria-live="polite">Lume está escrevendo</span>
                <i />
                <i />
                <i />
              </div>
            </div>
          )}
          {sendError && (
            <div className="conversation-error">
              <div className="form-message form-error" role="alert">
                {sendError}
              </div>
              {retryText && (
                <Button variant="secondary" onClick={() => void send(retryText)} disabled={sending}>
                  Tentar novamente <RotateCcw size={14} />
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="conversation-compose">
          {reachedMessageLimit ? (
            <div className="compose-limit">
              <strong>Esta conversa chegou ao limite de mensagens.</strong>
              <Button onClick={() => void endSession()} disabled={ending}>
                {ending ? "Gerando resumo..." : "Encerrar e ver o resumo"}
              </Button>
            </div>
          ) : (
            <>
              <div className="hint-row">
                <button disabled title="Disponível em uma etapa futura">
                  <Sparkles size={15} /> Preciso de uma dica
                </button>
                <button disabled title="Disponível em uma etapa futura">
                  <Languages size={15} /> Traduzir pergunta
                </button>
                {sending && (
                  <button className="cancel-generation" onClick={cancelGeneration}>
                    <X size={15} /> Cancelar
                  </button>
                )}
              </div>
              <div className="compose-box">
                <button
                  className="mic-button"
                  disabled
                  title="Entrada por voz ainda não disponível"
                >
                  <Mic2 />
                </button>
                <textarea
                  aria-label="Responder"
                  value={answer}
                  disabled={sending || ending}
                  onChange={(event) => setAnswer(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void send(answer);
                    }
                  }}
                  maxLength={2000}
                  placeholder="Digite sua resposta no idioma estudado..."
                />
                <button
                  className="send-button"
                  disabled={!answer.trim() || sending || ending}
                  onClick={() => void send(answer)}
                  aria-label="Enviar mensagem"
                >
                  <ArrowRight />
                </button>
              </div>
              <small>
                Pressione Enter para enviar · Shift + Enter para nova linha ·{" "}
                {remainingMessages} {remainingMessages === 1 ? "mensagem" : "mensagens"} nesta
                conversa
              </small>
            </>
          )}
        </div>
      </main>

      <aside className="conversation-side">
        <div>
          <span className="eyebrow">PROGRESSO DA SESSÃO</span>
          <ProgressRing value={progress} label="ritmo" />
          <small>
            {conversation.learner_message_count}{" "}
            {conversation.learner_message_count === 1 ? "mensagem enviada" : "mensagens enviadas"}
          </small>
        </div>
        <div className="session-goals">
          <h3>Nesta conversa</h3>
          {scenario.goals.map((goal) => (
            <p key={goal}>
              <i /> {goal}
            </p>
          ))}
          <small>O tutor avalia o objetivo no resumo, ao encerrar.</small>
        </div>
        <div className="live-words">
          <h3>Correções desta conversa</h3>
          {messages.some((message) => message.correction) ? (
            messages
              .filter((message) => message.correction)
              .slice(-4)
              .map((message) => (
                <p key={`correction-${message.sequence}`}>
                  <ins>{message.correction?.corrected}</ins>
                </p>
              ))
          ) : (
            <p>Nenhuma correção ainda. Escreva à vontade.</p>
          )}
        </div>
      </aside>
    </div>
  );
}

export function ConversationSummary({
  completed,
  goToScenarios,
  goToDashboard,
  goToSessions,
}: {
  completed: CompletedConversationView | null;
  goToScenarios: () => void;
  goToDashboard: () => void;
  goToSessions: () => void;
}) {
  if (!completed) {
    return (
      <div className="screen-content summary-screen">
        <div className="learning-loading">
          <CheckCircle2 />
          <p>Nenhum resumo aberto. Veja o histórico das suas conversas.</p>
          <Button onClick={goToSessions}>Ver histórico</Button>
        </div>
      </div>
    );
  }

  const { summary, scenario } = completed;
  return (
    <div className="screen-content summary-screen">
      <div className="summary-hero">
        <div className="celebration">✦</div>
        <span className="eyebrow light">SESSÃO CONCLUÍDA</span>
        <h1>{summary.headline_pt_br}</h1>
        <p>{summary.encouragement_pt_br}</p>
        <div className="summary-stats">
          <div>
            <strong>{formatElapsed(completed.elapsedSeconds)}</strong>
            <span>tempo</span>
          </div>
          <div>
            <strong>{completed.messageCount}</strong>
            <span>mensagens</span>
          </div>
          <div>
            <strong>{summary.vocabulary.length}</strong>
            <span>palavras salvas</span>
          </div>
          <div>
            <strong>{completed.correctionCount}</strong>
            <span>correções</span>
          </div>
        </div>
      </div>
      <div className="summary-layout">
        <main>
          <div className="score-card">
            <div>
              <span className="eyebrow">OBJETIVO DO CENÁRIO</span>
              <h2>{scenario.objective}</h2>
              <p>
                A estimativa considera apenas o que aconteceu nesta conversa, avaliado pelo tutor.
              </p>
            </div>
            <ProgressRing value={summary.objective_progress} label="objetivo" />
          </div>
          <div className="feedback-grid">
            <article className="strength-card">
              <div className="card-title">
                <CheckCircle2 />
                <strong>Pontos fortes</strong>
              </div>
              {summary.strengths_pt_br.map((strength) => (
                <p key={strength}>
                  <CheckCircle2 size={15} /> {strength}
                </p>
              ))}
            </article>
            <article className="focus-card">
              <div className="card-title">
                <RotateCcw />
                <strong>Para melhorar</strong>
              </div>
              {summary.focus_areas.length ? (
                summary.focus_areas.map((area, index) => (
                  <div className="focus-item" key={area.title_pt_br}>
                    <span>{index + 1}</span>
                    <div>
                      <strong>{area.title_pt_br}</strong>
                      <small>{area.detail_pt_br}</small>
                    </div>
                  </div>
                ))
              ) : (
                <div className="focus-item">
                  <div>
                    <small>O tutor não identificou pontos de melhoria nesta conversa.</small>
                  </div>
                </div>
              )}
            </article>
          </div>
          <div className="saved-words">
            <div className="section-heading compact">
              <div>
                <span className="eyebrow">VOCABULÁRIO</span>
                <h2>Palavras desta conversa</h2>
              </div>
            </div>
            {summary.vocabulary.length ? (
              <div>
                {summary.vocabulary.map((item) => (
                  <span key={item.term}>
                    {item.term}
                    <small>{item.translation_pt_br}</small>
                  </span>
                ))}
              </div>
            ) : (
              <p className="form-message">
                Nenhuma palavra nova foi destacada. Elas aparecem quando surgem na conversa.
              </p>
            )}
          </div>
        </main>
        <aside>
          <div className="next-card">
            <span className="eyebrow">PRÓXIMO PASSO</span>
            <div className="next-icon">
              <ArrowRight />
            </div>
            <h3>Praticar outro cenário</h3>
            <p>Alternar cenários ajuda você a usar o idioma em situações diferentes.</p>
            <Button full onClick={goToScenarios}>
              Escolher cenário
            </Button>
            <button onClick={goToSessions}>Ver histórico de conversas</button>
            <button onClick={goToDashboard}>Voltar ao início</button>
          </div>
        </aside>
      </div>
    </div>
  );
}
