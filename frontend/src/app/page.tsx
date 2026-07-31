"use client";

import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  Clock3,
  Coffee,
  Download,
  Flame,
  Globe2,
  GraduationCap,
  Headphones,
  Heart,
  Home,
  Languages,
  LockKeyhole,
  LogIn,
  Mail,
  Map,
  MessageCircle,
  Mic2,
  Plane,
  Play,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Trash2,
  Trophy,
  UserPlus,
  Utensils,
  Volume2,
  WandSparkles,
  X,
  Zap,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import {
  loadLearningContent,
  type LearningContent,
  type LearningLevel,
} from "@/lib/learning-content";
import { calculateDashboardMetrics } from "@/lib/progress";
import {
  isEmailConfirmed,
  isPasswordRecoveryCallback,
  onboardingStorageKeys,
  passwordRecoveryRedirectUrl,
  resolveDestination,
  scenarioStorageKey,
} from "@/lib/navigation";

type ScreenId =
  | "landing"
  | "demo"
  | "signup"
  | "login"
  | "recover"
  | "confirm-email"
  | "onboarding"
  | "dashboard"
  | "learn"
  | "plan"
  | "scenarios"
  | "conversation"
  | "summary"
  | "vocabulary"
  | "assessment"
  | "progress"
  | "profile"
  | "privacy";

type IconType = React.ComponentType<{ size?: number; strokeWidth?: number }>;

type AuthMode = "signup" | "login" | "recover" | "update";

type AuthFormData = {
  name: string;
  email: string;
  password: string;
};

type AuthFeedback = {
  error?: string;
  success?: string;
};

type TutorCorrection = {
  original: string;
  corrected: string;
  explanation_pt_br: string;
  severity: "minor" | "important" | "blocking";
};

type ConversationMessage = {
  id: string;
  role: "user" | "tutor";
  text: string;
  correction?: TutorCorrection | null;
};

type OnboardingData = {
  targetLanguage: "en" | "es" | "fr" | "it";
  currentLevel: "A1" | "A2" | "B1" | "B2" | "C1" | "unknown";
  learningGoal: "travel" | "career" | "conversation" | "exam";
  studyMinutesPerDay: 10 | 20 | 30 | 60;
};

type LearnerPreferences = OnboardingData & {
  studyDaysPerWeek: number;
};

type LearnerPreferencesRow = {
  target_language: OnboardingData["targetLanguage"];
  current_level: OnboardingData["currentLevel"];
  learning_goal: OnboardingData["learningGoal"];
  study_minutes_per_day: OnboardingData["studyMinutesPerDay"];
  study_days_per_week: number;
};

const mapLearnerPreferences = (row: LearnerPreferencesRow): LearnerPreferences => ({
  targetLanguage: row.target_language,
  currentLevel: row.current_level,
  learningGoal: row.learning_goal,
  studyMinutesPerDay: row.study_minutes_per_day,
  studyDaysPerWeek: row.study_days_per_week,
});

const languageDetails: Record<OnboardingData["targetLanguage"], { flag: string; name: string }> = {
  en: { flag: "🇺🇸", name: "Inglês" },
  es: { flag: "🇪🇸", name: "Espanhol" },
  fr: { flag: "🇫🇷", name: "Francês" },
  it: { flag: "🇮🇹", name: "Italiano" },
};

const levelLabels: Record<OnboardingData["currentLevel"], string> = {
  unknown: "Nível ainda não definido",
  A1: "A1 · Iniciante",
  A2: "A2 · Básico",
  B1: "B1 · Intermediário",
  B2: "B2 · Independente",
  C1: "C1 · Avançado",
};

const selectableLevels: OnboardingData["currentLevel"][] = ["unknown", "A1", "A2", "B1", "B2"];

const goalLabels: Record<OnboardingData["learningGoal"], string> = {
  travel: "Viagens",
  career: "Carreira",
  conversation: "Conversação",
  exam: "Preparação para provas",
};

const screens: Array<{ id: ScreenId; label: string; icon: IconType; group: string }> = [
  { id: "landing", label: "Landing", icon: Sparkles, group: "Entrada" },
  { id: "demo", label: "Demonstração", icon: MessageCircle, group: "Entrada" },
  { id: "signup", label: "Cadastro", icon: UserPlus, group: "Entrada" },
  { id: "login", label: "Login", icon: LogIn, group: "Entrada" },
  { id: "recover", label: "Recuperar senha", icon: Mail, group: "Entrada" },
  { id: "confirm-email", label: "Confirmar email", icon: Mail, group: "Entrada" },
  { id: "onboarding", label: "Onboarding", icon: Target, group: "Entrada" },
  { id: "dashboard", label: "Início", icon: Home, group: "Produto" },
  { id: "learn", label: "Aprender", icon: GraduationCap, group: "Produto" },
  { id: "plan", label: "Plano", icon: Map, group: "Produto" },
  { id: "scenarios", label: "Cenários", icon: Globe2, group: "Produto" },
  { id: "conversation", label: "Conversa", icon: Mic2, group: "Produto" },
  { id: "summary", label: "Resumo", icon: CheckCircle2, group: "Produto" },
  { id: "vocabulary", label: "Revisar", icon: RotateCcw, group: "Produto" },
  { id: "assessment", label: "Avaliação", icon: GraduationCap, group: "Progresso" },
  { id: "progress", label: "Progresso", icon: BarChart3, group: "Progresso" },
  { id: "profile", label: "Perfil", icon: Settings, group: "Conta" },
  { id: "privacy", label: "Dados e privacidade", icon: ShieldCheck, group: "Conta" },
];

const appScreens = new Set<ScreenId>([
  "dashboard",
  "learn",
  "plan",
  "scenarios",
  "conversation",
  "summary",
  "vocabulary",
  "assessment",
  "progress",
  "profile",
  "privacy",
]);

function Brand({ compact = false, onClick }: { compact?: boolean; onClick?: () => void }) {
  return (
    <button className="brand" aria-label="Ir para início" data-compact={compact} onClick={onClick}>
      <span className="brand-mark">
        <Sparkles size={compact ? 17 : 20} />
      </span>
      {!compact && <span>Lume</span>}
    </button>
  );
}

function Button({
  children,
  variant = "primary",
  icon,
  onClick,
  type = "button",
  full = false,
  disabled = false,
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "dark" | "danger";
  icon?: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  full?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      className={`button button-${variant}${full ? " button-full" : ""}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
      {icon}
    </button>
  );
}

function ProgressRing({ value, label }: { value: number; label: string }) {
  return (
    <div className="progress-ring" style={{ "--progress": `${value * 3.6}deg` } as React.CSSProperties}>
      <div>
        <strong>{value}%</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

function Stat({
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

function Landing({ go }: { go: (id: ScreenId) => void }) {
  const showDetails = () => document.getElementById("como-funciona")?.scrollIntoView({ behavior: "smooth" });
  return (
    <main className="landing">
      <header className="public-header">
        <Brand onClick={() => go("landing")} />
        <nav>
          <button onClick={showDetails}>Como funciona</button>
          <button onClick={showDetails}>Plano de estudo</button>
        </nav>
        <div className="header-actions">
          <Button variant="ghost" onClick={() => go("login")}>Entrar</Button>
          <Button onClick={() => go("demo")} icon={<ArrowRight size={18} />}>Experimentar</Button>
        </div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow"><Sparkles size={16} /> Tutor pessoal com IA</span>
          <h1>Fale com confiança.<br /><em>Aprenda do seu jeito.</em></h1>
          <p>
            Conversas reais, correções gentis e um plano que se adapta ao seu
            ritmo — em inglês, espanhol, francês ou italiano.
          </p>
          <div className="hero-actions">
            <Button onClick={() => go("demo")} icon={<Play size={18} fill="currentColor" />}>
              Fazer uma conversa grátis
            </Button>
            <span>Sem cadastro · 3 interações</span>
          </div>
          <div className="trust-row">
            <div className="avatars"><span>AM</span><span>JV</span><span>LS</span></div>
            <div><strong>Feito para brasileiros</strong><small>Explicações que fazem sentido para você</small></div>
          </div>
        </div>
        <div className="hero-visual">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="tutor-card">
            <div className="tutor-head">
              <div className="tutor-avatar">Lu</div>
              <div><strong>Lume</strong><span><i /> Tutor online</span></div>
              <Volume2 size={20} />
            </div>
            <div className="bubble bubble-tutor">
              <small>ENGLISH · A2</small>
              How would you order your favorite coffee?
            </div>
            <div className="bubble bubble-user">I want one coffee with milk, please.</div>
            <div className="correction">
              <Check size={16} />
              <div><strong>Quase perfeito!</strong><span>“I’d like a coffee with milk, please.” soa mais natural.</span></div>
            </div>
            <div className="composer">
              <Mic2 size={21} />
              <span>Responda por voz ou texto...</span>
              <ArrowRight size={18} />
            </div>
          </div>
          <div className="floating-badge badge-streak"><Flame size={18} /> 7 dias</div>
          <div className="floating-badge badge-progress"><Trophy size={18} /> +24% fluência</div>
        </div>
      </section>

      <section className="value-strip" id="como-funciona">
        <article><MessageCircle /><strong>Converse de verdade</strong><span>Cenários que você vai usar.</span></article>
        <article><WandSparkles /><strong>Correção na hora</strong><span>Clara, gentil e contextual.</span></article>
        <article><Map /><strong>Plano só seu</strong><span>Adaptado à sua rotina.</span></article>
        <article><BarChart3 /><strong>Progresso visível</strong><span>Sem métricas vazias.</span></article>
      </section>
    </main>
  );
}

function Demo({ go }: { go: (id: ScreenId) => void }) {
  const [answer, setAnswer] = useState("");
  const [interactions, setInteractions] = useState(1);
  const [messages, setMessages] = useState<Array<{ role: "user" | "tutor"; text: string }>>([]);
  const remaining = Math.max(0, 3 - interactions);
  const send = () => {
    const text = answer.trim();
    if (!text || remaining === 0) return;
    const tutorReplies = [
      "Sounds good! What size would you like?",
      "Perfect! Anything else for you today?",
    ];
    setMessages((current) => [
      ...current,
      { role: "user", text },
      { role: "tutor", text: tutorReplies[Math.min(interactions - 1, tutorReplies.length - 1)] },
    ]);
    setAnswer("");
    setInteractions((current) => current + 1);
  };
  return (
    <div className="public-shell demo-shell">
      <header className="simple-header"><Brand onClick={() => go("landing")} /><span className="step-label">Demonstração · 2 de 3</span><button onClick={() => go("landing")}><X /></button></header>
      <main className="demo-main">
        <div className="demo-context">
          <span className="scenario-icon"><Coffee /></span>
          <div><small>CENÁRIO</small><h2>Pedido em uma cafeteria</h2><p>Pratique uma situação comum em inglês.</p></div>
          <span className="level-chip">A2</span>
        </div>
        <div className="chat-stream">
          <div className="chat-message tutor-message"><div className="mini-avatar">Lu</div><div><span>Good morning! What can I get for you today?</span><button disabled title="Áudio disponível em uma etapa futura"><Volume2 size={15} /> Ouvir</button></div></div>
          <div className="chat-message user-message"><div><span>I want one coffee with milk, please.</span><small>Agora</small></div></div>
          <div className="inline-feedback">
            <div className="feedback-title"><CheckCircle2 /><strong>Boa resposta!</strong><span>1 ajuste</span></div>
            <div className="compare"><del>I want one coffee</del><ArrowRight size={15}/><ins>I’d like a coffee</ins></div>
            <p>Em pedidos, <strong>“I’d like...”</strong> soa mais natural e educado.</p>
            <button disabled title="A demonstração interativa será conectada ao tutor de IA">Tentar novamente <RotateCcw size={14} /></button>
          </div>
          <div className="chat-message tutor-message"><div className="mini-avatar">Lu</div><div><span>Great choice! Would you like it hot or iced?</span></div></div>
          {messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className={`chat-message ${message.role === "user" ? "user-message" : "tutor-message"}`}>
              {message.role === "tutor" && <div className="mini-avatar">Lu</div>}
              <div><span>{message.text}</span></div>
            </div>
          ))}
        </div>
        <div className="demo-composer">
          <button className="mic-button" disabled title="Entrada por voz ainda não disponível"><Mic2 /></button>
          <input
            aria-label="Sua resposta"
            value={answer}
            disabled={remaining === 0}
            onChange={(event) => setAnswer(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") send();
            }}
            placeholder={remaining ? "Digite sua resposta em inglês..." : "Demonstração concluída"}
          />
          <button className="send-button" disabled={!answer.trim() || remaining === 0} onClick={send} aria-label="Enviar resposta"><ArrowRight /></button>
        </div>
        <small className="demo-note">
          {remaining > 0 ? `Você tem mais ${remaining} ${remaining === 1 ? "interação grátis" : "interações grátis"}` : "Gostou? Crie sua conta para conversar com o tutor de IA."}
        </small>
      </main>
    </div>
  );
}

function AuthScreen({
  mode,
  go,
  submit,
}: {
  mode: AuthMode;
  go: (id: ScreenId) => void;
  submit: (mode: AuthMode, data: AuthFormData) => Promise<AuthFeedback>;
}) {
  const [form, setForm] = useState<AuthFormData>({ name: "", email: "", password: "" });
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [feedback, setFeedback] = useState<AuthFeedback>({});
  const [submitting, setSubmitting] = useState(false);
  const copy = {
    signup: { title: "Crie seu espaço de aprendizagem", subtitle: "Salve seu progresso e receba um plano feito para você.", action: "Criar conta" },
    login: { title: "Que bom ter você de volta", subtitle: "Continue exatamente de onde parou.", action: "Entrar" },
    recover: { title: "Recupere seu acesso", subtitle: "Enviaremos um link seguro para redefinir sua senha.", action: "Enviar link" },
    update: { title: "Crie uma nova senha", subtitle: "Escolha uma senha segura com pelo menos oito caracteres.", action: "Atualizar senha" },
  }[mode];

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback({});

    if (mode === "signup" && !acceptedTerms) {
      setFeedback({ error: "Você precisa aceitar os Termos e a Política de Privacidade." });
      return;
    }

    setSubmitting(true);
    setFeedback(await submit(mode, form));
    setSubmitting(false);
  };

  return (
    <div className="auth-layout">
      <aside className="auth-aside">
        <Brand onClick={() => go("landing")} />
        <div>
          <span className="eyebrow light"><Heart size={16}/> Aprendizado sem pressão</span>
          <h2>Seu próximo idioma começa com uma conversa.</h2>
          <blockquote>“As correções explicam exatamente o que eu precisava, sem quebrar o ritmo da conversa.”</blockquote>
          <div className="quote-person"><span>MR</span><div><strong>Marina R.</strong><small>Aprendendo inglês · A2</small></div></div>
        </div>
        <small>© 2026 Lume · Privacidade em primeiro lugar</small>
      </aside>
      <main className="auth-main">
        <button className="back-link" onClick={() => go("landing")}><ArrowLeft size={16}/> Voltar</button>
        <form className="auth-card" onSubmit={handleSubmit}>
          <h1>{copy.title}</h1><p>{copy.subtitle}</p>
          {mode === "signup" && <label>Nome<input required maxLength={100} autoComplete="name" value={form.name} onChange={(event) => setForm({...form, name: event.target.value})} placeholder="Como podemos chamar você?" /></label>}
          {mode !== "update" && <label>Email<input required type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({...form, email: event.target.value})} placeholder="voce@email.com" /></label>}
          {mode !== "recover" && <label>Senha<div className="password-wrap"><input required minLength={8} type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={form.password} onChange={(event) => setForm({...form, password: event.target.value})} placeholder="Mínimo de 8 caracteres" /><LockKeyhole size={17}/></div></label>}
          {mode === "login" && <button type="button" className="forgot" onClick={() => go("recover")}>Esqueci minha senha</button>}
          {mode === "signup" && <label className="check-label"><input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)}/> <span>Li e aceito os Termos e a Política de Privacidade.</span></label>}
          {feedback.error && <div className="form-message form-error" role="alert">{feedback.error}</div>}
          {feedback.success && <div className="form-message form-success" role="status">{feedback.success}</div>}
          <Button full type="submit" disabled={submitting} icon={submitting ? undefined : <ArrowRight size={18}/>}>{submitting ? "Aguarde..." : copy.action}</Button>
          {(mode === "signup" || mode === "login") && <p className="auth-switch">{mode === "signup" ? "Já tem uma conta?" : "Ainda não tem uma conta?"} <button type="button" onClick={() => go(mode === "signup" ? "login" : "signup")}>{mode === "signup" ? "Entrar" : "Criar conta"}</button></p>}
        </form>
      </main>
    </div>
  );
}

function ConfirmEmail({
  email,
  go,
  resend,
  checkConfirmation,
}: {
  email: string;
  go: (id: ScreenId) => void;
  resend: (email: string) => Promise<AuthFeedback>;
  checkConfirmation: () => Promise<AuthFeedback>;
}) {
  const [cooldown, setCooldown] = useState(0);
  const [feedback, setFeedback] = useState<AuthFeedback>({});
  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const resendEmail = async () => {
    if (!email || cooldown > 0 || resending) return;
    setResending(true);
    setFeedback({});
    const result = await resend(email);
    setFeedback(result);
    if (!result.error) setCooldown(60);
    setResending(false);
  };

  const verify = async () => {
    setChecking(true);
    setFeedback(await checkConfirmation());
    setChecking(false);
  };

  const maskedEmail = email
    ? email.replace(/^(.{2}).*(@.*)$/, "$1••••$2")
    : "seu endereço de email";

  return (
    <div className="confirmation-page">
      <header className="simple-header">
        <Brand onClick={() => go("landing")}/>
        <button onClick={() => go("login")}>Já tenho uma conta</button>
      </header>
      <main className="confirmation-card">
        <div className="confirmation-illustration">
          <span><Mail size={38}/></span>
          <i><Check size={17}/></i>
        </div>
        <span className="eyebrow">SÓ FALTA UM PASSO</span>
        <h1>Confirme seu email</h1>
        <p>Se este for um cadastro novo, enviaremos um link para</p>
        <strong className="confirmation-email">{maskedEmail}</strong>
        <div className="confirmation-instructions">
          <div><span>1</span><p><strong>Abra sua caixa de entrada</strong><small>Procure pelo email do Lume. Se você já possui conta, use o login ou recupere sua senha.</small></p></div>
          <div><span>2</span><p><strong>Clique em “Confirmar email”</strong><small>Você voltará automaticamente para criar seu plano.</small></p></div>
        </div>
        {feedback.error && <div className="form-message form-error" role="alert">{feedback.error}</div>}
        {feedback.success && <div className="form-message form-success" role="status">{feedback.success}</div>}
        <Button full onClick={verify} disabled={checking} icon={checking ? undefined : <CheckCircle2 size={18}/>}>
          {checking ? "Verificando..." : "Já confirmei meu email"}
        </Button>
        <div className="confirmation-resend">
          <span>Não recebeu?</span>
          <button disabled={!email || cooldown > 0 || resending} onClick={resendEmail}>
            {resending ? "Reenviando..." : cooldown > 0 ? `Reenviar em ${cooldown}s` : "Reenviar email"}
          </button>
        </div>
        <button className="change-email" onClick={() => go("signup")}>
          Informei o email errado
        </button>
        <aside><ShieldCheck size={17}/><span>O link expira por segurança. Verifique também spam e promoções.</span></aside>
      </main>
    </div>
  );
}

function Onboarding({
  complete,
  go,
  initialPreferences,
  userId,
}: {
  complete: (data: OnboardingData) => Promise<AuthFeedback>;
  go: (id: ScreenId) => void;
  initialPreferences: LearnerPreferences | null;
  userId: string;
}) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<OnboardingData>({
    targetLanguage: initialPreferences?.targetLanguage || "en",
    currentLevel: initialPreferences?.currentLevel || "unknown",
    learningGoal: initialPreferences?.learningGoal || "conversation",
    studyMinutesPerDay: initialPreferences?.studyMinutesPerDay || 20,
  });
  const [draftRestored, setDraftRestored] = useState(false);
  const [feedback, setFeedback] = useState<AuthFeedback>({});
  const [submitting, setSubmitting] = useState(false);
  const questions = [
    { title: "Qual idioma você quer aprender primeiro?", subtitle: "Você poderá adicionar outros idiomas quando quiser." },
    { title: "Como está seu nível hoje?", subtitle: "Não se preocupe: você poderá fazer uma avaliação depois." },
    { title: "Qual é seu principal objetivo?", subtitle: "Usaremos isso para priorizar cenários e vocabulário." },
    { title: "Quanto tempo cabe na sua rotina?", subtitle: "Uma meta realista funciona melhor do que uma meta perfeita." },
  ];

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const keys = onboardingStorageKeys(userId);
      const savedDraft = window.sessionStorage.getItem(keys.draft);
      const savedStep = Number(window.sessionStorage.getItem(keys.step));
      if (savedDraft) {
        try {
          setData(JSON.parse(savedDraft) as OnboardingData);
        } catch {
          window.sessionStorage.removeItem(keys.draft);
        }
      }
      if (savedStep >= 1 && savedStep <= 4) setStep(savedStep);
      setDraftRestored(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [userId]);

  useEffect(() => {
    if (!draftRestored) return;
    const keys = onboardingStorageKeys(userId);
    window.sessionStorage.setItem(keys.draft, JSON.stringify(data));
    window.sessionStorage.setItem(keys.step, String(step));
  }, [data, draftRestored, step, userId]);

  const next = async () => {
    if (step < 4) {
      setStep(step + 1);
      return;
    }
    setSubmitting(true);
    const result = await complete(data);
    setFeedback(result);
    if (!result.error) {
      const keys = onboardingStorageKeys(userId);
      window.sessionStorage.removeItem(keys.draft);
      window.sessionStorage.removeItem(keys.step);
    }
    setSubmitting(false);
  };

  return (
    <div className="onboarding-shell">
      <header className="simple-header"><Brand onClick={() => go("landing")}/><span className="step-label">Passo {step} de 4</span><span /></header>
      <div className="onboarding-progress">{[1,2,3,4].map((item) => <i key={item} className={item <= step ? "complete" : ""}/>)}</div>
      <main className="onboarding-main">
        <span className="question-count">{String(step).padStart(2, "0")}</span>
        <h1>{questions[step - 1].title}</h1>
        <p>{questions[step - 1].subtitle}</p>
        {step === 1 && <div className="language-grid">
          {([
            ["🇺🇸", "Inglês", "English", "en"],
            ["🇪🇸", "Espanhol", "Español", "es"],
            ["🇫🇷", "Francês", "Français", "fr"],
            ["🇮🇹", "Italiano", "Italiano", "it"],
          ] as const).map(([flag, name, native, value]) => (
            <button key={value} className={data.targetLanguage === value ? "selected" : ""} onClick={() => setData({...data, targetLanguage: value})}>
              <span>{flag}</span><div><strong>{name}</strong><small>{native}</small></div>{data.targetLanguage === value && <CheckCircle2/>}
            </button>
          ))}
        </div>}
        {step === 2 && <div className="language-grid choice-grid">
          {([
            ["Nunca estudei", "Começar do início", "unknown"],
            ["A1 · Iniciante", "Entendo palavras e frases simples", "A1"],
            ["A2 · Básico", "Lido com situações cotidianas", "A2"],
            ["B1 · Intermediário", "Consigo manter conversas", "B1"],
            ["B2 · Independente", "Converso com boa fluência", "B2"],
          ] as const).map(([name, description, value]) => (
            <button key={value} className={data.currentLevel === value ? "selected" : ""} onClick={() => setData({...data, currentLevel: value})}>
              <div><strong>{name}</strong><small>{description}</small></div>{data.currentLevel === value && <CheckCircle2/>}
            </button>
          ))}
        </div>}
        {step === 3 && <div className="language-grid choice-grid">
          {([
            ["✈️", "Viajar", "Usar o idioma em viagens", "travel"],
            ["💼", "Carreira", "Trabalho e oportunidades", "career"],
            ["💬", "Conversação", "Falar com mais confiança", "conversation"],
            ["🎓", "Provas", "Preparação para certificações", "exam"],
          ] as const).map(([icon, name, description, value]) => (
            <button key={value} className={data.learningGoal === value ? "selected" : ""} onClick={() => setData({...data, learningGoal: value})}>
              <span>{icon}</span><div><strong>{name}</strong><small>{description}</small></div>{data.learningGoal === value && <CheckCircle2/>}
            </button>
          ))}
        </div>}
        {step === 4 && <div className="language-grid choice-grid">
          {([10, 20, 30, 60] as const).map((minutes) => (
            <button key={minutes} className={data.studyMinutesPerDay === minutes ? "selected" : ""} onClick={() => setData({...data, studyMinutesPerDay: minutes})}>
              <div><strong>{minutes} minutos por dia</strong><small>{minutes <= 10 ? "Uma rotina leve" : minutes <= 20 ? "Recomendado para consistência" : "Para avançar mais rápido"}</small></div>{data.studyMinutesPerDay === minutes && <CheckCircle2/>}
            </button>
          ))}
        </div>}
        {feedback.error && <div className="form-message form-error" role="alert">{feedback.error}</div>}
        <div className="onboarding-actions">
          <Button variant="ghost" disabled={step === 1 || submitting} onClick={() => setStep(Math.max(1, step - 1))}><ArrowLeft size={18}/> Voltar</Button>
          <Button onClick={next} disabled={submitting} icon={submitting ? undefined : <ArrowRight size={18}/>}>{submitting ? "Salvando..." : step === 4 ? "Criar meu plano" : "Continuar"}</Button>
        </div>
      </main>
    </div>
  );
}

function AppHeader({
  title,
  subtitle,
  displayName,
  preferences,
}: {
  title: string;
  subtitle?: string;
  displayName?: string;
  preferences?: LearnerPreferences | null;
}) {
  const language = preferences ? languageDetails[preferences.targetLanguage] : languageDetails.en;
  return (
    <header className="app-header">
      <div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
      <div className="app-header-tools">
        <button className="language-switch" disabled title="A troca de idioma ficará disponível nas configurações"><span>{language.flag}</span> {language.name}</button>
        <button className="icon-button" disabled title="Notificações em breve"><Bell size={20}/></button>
        <div className="user-avatar">{(displayName || "Aluno").slice(0, 2).toUpperCase()}</div>
      </div>
    </header>
  );
}

function Dashboard({ go, displayName, preferences, session, startScenario }: { go: (id: ScreenId) => void; displayName: string; preferences: LearnerPreferences | null; session: Session | null; startScenario: (scenario: Scenario) => void }) {
  const level = preferences ? levelLabels[preferences.currentLevel].split(" · ")[0] : "A1";
  const language = preferences ? languageDetails[preferences.targetLanguage].name : "Inglês";
  const [metrics, setMetrics] = useState(() => calculateDashboardMetrics([], preferences?.studyDaysPerWeek || 5));
  const [metricsLoading, setMetricsLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !session) {
      return;
    }

    let active = true;
    const loadMetrics = async () => {
      setMetricsLoading(true);
      const [learningResult, conversationResult] = await Promise.all([
        supabase
          .from("learning_activity_progress")
          .select("completed_at")
          .eq("user_id", session.user.id),
        supabase
          .from("llm_usage_events")
          .select("created_at")
          .eq("user_id", session.user.id)
          .eq("status", "succeeded"),
      ]);
      if (!active) return;
      const conversationDays = new Set<string>();
      const conversationTimestamps = (conversationResult.data || [])
        .map(({ created_at }) => created_at)
        .filter((timestamp) => {
          const day = timestamp.slice(0, 10);
          if (conversationDays.has(day)) return false;
          conversationDays.add(day);
          return true;
        });
      const timestamps = [
        ...(learningResult.data || []).map(({ completed_at }) => completed_at),
        ...conversationTimestamps,
      ];
      setMetrics(calculateDashboardMetrics(timestamps, preferences?.studyDaysPerWeek || 5));
      setMetricsLoading(false);
    };
    void loadMetrics();
    return () => { active = false; };
  }, [preferences?.studyDaysPerWeek, session]);

  const monthlyTarget = metrics.weeklyTarget * 4;
  const monthlyPercent = Math.min(100, Math.round((metrics.activitiesThisMonth / monthlyTarget) * 100));
  const monthName = new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(new Date());
  return (
    <div className="screen-content">
      <AppHeader title={`Olá, ${displayName}!`} subtitle={`Continue avançando em ${language}.`} displayName={displayName} preferences={preferences}/>
      <div className="streak-banner">
        <div className="streak-main"><span><Flame/></span><div><small>SEQUÊNCIA ATUAL</small><strong>{metricsLoading ? "…" : `${metrics.streak} ${metrics.streak === 1 ? "dia" : "dias"}`}</strong></div></div>
        <div className="week-dots">{["S","T","Q","Q","S","S","D"].map((day, index)=><div key={`${day}-${index}`} className={metrics.activeWeekdays[index] ? "done" : ""}><span>{day}</span><i>{metrics.activeWeekdays[index] ? <Check size={12}/> : ""}</i></div>)}</div>
        <p>{metricsLoading ? "Carregando seu progresso…" : <>Você estudou <strong>{metrics.activeDaysThisWeek} de {metrics.weeklyTarget} dias</strong> nesta semana. Hoje: <strong>{metrics.completedToday}</strong>.</>}</p>
      </div>
      <section className="dashboard-grid">
        <div className="main-column">
          <div className="section-heading"><div><span className="eyebrow">PRÓXIMA ATIVIDADE</span><h2>Continue seu plano</h2></div><button onClick={() => go("plan")}>Ver plano completo <ArrowRight size={16}/></button></div>
          <article className="next-lesson">
            <div className="lesson-visual"><div className="coffee-cup">☕</div><span>Conversação</span></div>
            <div className="lesson-copy"><span className="level-chip">{level} · COTIDIANO</span><h3>Um café, por favor</h3><p>Pratique pedidos, tamanhos e preferências em {language}.</p><div className="lesson-meta"><span><Clock3 size={16}/> {preferences?.studyMinutesPerDay || 10} min</span><span><MessageCircle size={16}/> Conversa guiada</span></div><Button onClick={() => startScenario(scenarioData[0])} icon={<Play size={17} fill="currentColor"/>}>Começar atividade</Button></div>
            <ProgressRing value={metrics.weeklyPercent} label="semana"/>
          </article>
          <div className="section-heading compact"><h2>Pratique do seu jeito</h2></div>
          <div className="quick-grid">
            <button onClick={() => go("scenarios")}><span className="quick-icon coral"><MessageCircle/></span><div><strong>Conversar</strong><small>Escolha um cenário</small></div><ChevronRight/></button>
            <button onClick={() => go("learn")}><span className="quick-icon teal"><BookOpen/></span><div><strong>Aprender</strong><small>Leitura, gramática e flashcards</small></div><ChevronRight/></button>
            <button onClick={() => go("vocabulary")}><span className="quick-icon blue"><Zap/></span><div><strong>Revisar</strong><small>12 palavras para hoje</small></div><ChevronRight/></button>
          </div>
        </div>
        <aside className="side-column">
          <div className="goal-card"><div className="card-title"><Target/><strong>Meta mensal</strong><span>{monthName}</span></div><ProgressRing value={monthlyPercent} label="concluído"/><p><strong>{metrics.activitiesThisMonth}</strong> de {monthlyTarget} atividades</p><small>{monthlyPercent >= 100 ? "Meta concluída!" : "Cada atividade concluída conta."}</small></div>
          <div className="review-card"><div className="card-title"><Zap/><strong>Progresso diário</strong></div><h3>{metrics.completedToday ? `${metrics.completedToday} ${metrics.completedToday === 1 ? "atividade concluída" : "atividades concluídas"}` : "Comece sua primeira atividade"}</h3><p>Leituras, exercícios, flashcards e conversas atualizam este card automaticamente.</p><Button variant="secondary" full onClick={() => go("learn")}>{metrics.completedToday ? "Continuar estudando" : "Começar agora"}</Button></div>
        </aside>
      </section>
    </div>
  );
}

function Plan({ go, displayName, preferences, startScenario }: { go: (id: ScreenId) => void; displayName: string; preferences: LearnerPreferences | null; startScenario: (scenario: Scenario) => void }) {
  const days = [
    { day: "SEG", date: "20", done: true, title: "Apresentações", type: "Conversa", time: "10 min" },
    { day: "TER", date: "21", done: true, title: "Revisão de vocabulário", type: "Revisão", time: "8 min" },
    { day: "QUA", date: "22", active: true, title: "Um café, por favor", type: "Conversa", time: "10 min" },
    { day: "QUI", date: "23", title: "Present simple", type: "Gramática", time: "15 min" },
    { day: "SEX", date: "24", title: "Minha rotina", type: "Escrita", time: "10 min" },
  ];
  return (
    <div className="screen-content">
      <AppHeader title="Seu plano de estudo" subtitle="Sua rotina personalizada" displayName={displayName} preferences={preferences}/>
      <div className="plan-overview">
        <div><span className="eyebrow">META DO MÊS</span><h2>{preferences ? goalLabels[preferences.learningGoal] : "Conversação"}</h2><p>Baseado no seu nível {preferences ? levelLabels[preferences.currentLevel] : "inicial"} e em {preferences?.studyMinutesPerDay || 20} minutos por dia.</p></div>
        <div className="plan-progress"><strong>68%</strong><div><i/></div><span>8h 10min de 12h</span></div>
        <button onClick={() => go("profile")}><Settings size={18}/> Ajustar plano</button>
      </div>
      <div className="week-layout">
        <section className="week-list">
          <div className="section-heading compact"><h2>Esta semana</h2><span>3 de 5 atividades</span></div>
          {days.map((item) => (
            <article key={item.day} className={`day-row${item.active ? " active" : ""}${item.done ? " complete" : ""}`}>
              <div className="date-block"><span>{item.day}</span><strong>{item.date}</strong></div>
              <span className="timeline-dot">{item.done ? <Check size={16}/> : item.active ? <Play size={15}/> : ""}</span>
              <div className="day-copy"><span>{item.type}</span><h3>{item.title}</h3><small><Clock3 size={14}/> {item.time}</small></div>
              {item.active ? <Button onClick={() => startScenario(scenarioData[0])}>Começar</Button> : <button className="more-button" disabled title="Atividade ainda indisponível">•••</button>}
            </article>
          ))}
        </section>
        <aside className="plan-aside">
          <div className="insight-card"><Sparkles/><span>INSIGHT DO TUTOR</span><h3>Você aprende melhor conversando.</h3><p>Incluímos mais duas práticas guiadas nesta semana com base no seu desempenho.</p></div>
          <div className="month-card"><h3>Próximos marcos</h3><div><span>01</span><p><strong>Fazer um pedido completo</strong><small>Meta desta semana</small></p><CheckCircle2/></div><div><span>02</span><p><strong>Descrever sua rotina</strong><small>Próxima semana</small></p></div><div><span>03</span><p><strong>Manter 5 min de conversa</strong><small>Meta do mês</small></p></div></div>
        </aside>
      </div>
    </div>
  );
}

type Scenario = {
  id: string;
  icon: IconType;
  title: string;
  desc: string;
  objective: string;
  category: "Cotidiano" | "Profissional" | "Viagem";
  level: string;
  time: string;
  color: string;
};

const scenarioData: Scenario[] = [
  { id: "coffee", icon: Coffee, title: "Na cafeteria", desc: "Faça pedidos e fale sobre preferências.", objective: "Faça um pedido completo e pergunte o preço.", category: "Cotidiano", level: "A2", time: "10 min", color: "coral" },
  { id: "airport", icon: Plane, title: "No aeroporto", desc: "Check-in, bagagem e orientações.", objective: "Faça o check-in e confirme o portão de embarque.", category: "Viagem", level: "A2", time: "12 min", color: "blue" },
  { id: "interview", icon: BriefcaseBusiness, title: "Entrevista de emprego", desc: "Conte sua experiência e objetivos.", objective: "Apresente sua experiência e responda sobre seus objetivos.", category: "Profissional", level: "B1", time: "15 min", color: "teal" },
  { id: "restaurant", icon: Utensils, title: "No restaurante", desc: "Reserve, escolha e peça a conta.", objective: "Escolha um prato, faça perguntas e peça a conta.", category: "Cotidiano", level: "A2", time: "10 min", color: "amber" },
  { id: "free", icon: Globe2, title: "Conversa livre", desc: "Escolha qualquer assunto com o tutor.", objective: "Mantenha uma conversa livre no idioma estudado.", category: "Cotidiano", level: "A1–B2", time: "Livre", color: "purple" },
  { id: "meeting", icon: Headphones, title: "Reunião de trabalho", desc: "Opine, concorde e peça esclarecimentos.", objective: "Compartilhe uma opinião e peça um esclarecimento.", category: "Profissional", level: "B1", time: "15 min", color: "navy" },
];

const scenarioOpenings: Record<OnboardingData["targetLanguage"], Record<string, string>> = {
  en: {
    coffee: "Good afternoon! Welcome. What can I get started for you?",
    airport: "Good morning! May I see your passport and booking confirmation?",
    interview: "Welcome! Could you start by telling me a little about yourself?",
    restaurant: "Good evening! Do you have a reservation?",
    free: "Hello! What would you like to talk about today?",
    meeting: "Thanks for joining. What is your view on today’s proposal?",
  },
  es: {
    coffee: "¡Buenas tardes! ¿Qué te gustaría pedir?",
    airport: "¡Buenos días! ¿Puedo ver tu pasaporte y tu reserva?",
    interview: "¡Bienvenido! ¿Puedes contarme un poco sobre ti?",
    restaurant: "¡Buenas noches! ¿Tienes una reserva?",
    free: "¡Hola! ¿De qué te gustaría hablar hoy?",
    meeting: "Gracias por participar. ¿Qué opinas de la propuesta de hoy?",
  },
  fr: {
    coffee: "Bonjour ! Qu’est-ce que vous souhaitez commander ?",
    airport: "Bonjour ! Puis-je voir votre passeport et votre réservation ?",
    interview: "Bienvenue ! Pouvez-vous vous présenter brièvement ?",
    restaurant: "Bonsoir ! Avez-vous une réservation ?",
    free: "Bonjour ! De quoi souhaitez-vous parler aujourd’hui ?",
    meeting: "Merci d’être là. Que pensez-vous de la proposition ?",
  },
  it: {
    coffee: "Buon pomeriggio! Cosa desidera ordinare?",
    airport: "Buongiorno! Posso vedere il passaporto e la prenotazione?",
    interview: "Benvenuto! Può raccontarmi qualcosa di lei?",
    restaurant: "Buonasera! Ha una prenotazione?",
    free: "Ciao! Di cosa vorresti parlare oggi?",
    meeting: "Grazie per essere qui. Cosa ne pensa della proposta?",
  },
};

function Scenarios({
  displayName,
  preferences,
  selectScenario,
}: {
  displayName: string;
  preferences: LearnerPreferences | null;
  selectScenario: (scenario: Scenario) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"Todos" | Scenario["category"]>("Todos");
  const visibleScenarios = scenarioData.filter((scenario) =>
    (category === "Todos" || scenario.category === category)
    && `${scenario.title} ${scenario.desc}`.toLocaleLowerCase("pt-BR").includes(query.trim().toLocaleLowerCase("pt-BR"))
  );
  return (
    <div className="screen-content">
      <AppHeader title="Escolha uma conversa" subtitle="Pratique situações que fazem parte da sua vida." displayName={displayName} preferences={preferences}/>
      <div className="filter-row"><div className="search-box"><Search size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cenário..."/></div><div className="filter-pills">{(["Todos","Cotidiano","Profissional","Viagem"] as const).map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div></div>
      <div className="featured-scenario">
        <div><span className="eyebrow light">RECOMENDADO PARA VOCÊ</span><h2>Desafio da semana</h2><p>Converse por cinco minutos sem recorrer ao português.</p><div><span><Clock3 size={16}/> 10 min</span><span><Target size={16}/> Fluência</span></div><Button onClick={() => selectScenario(scenarioData[0])} variant="secondary" icon={<ArrowRight size={17}/>}>Aceitar desafio</Button></div>
        <div className="challenge-art"><div className="speech-orb"><MessageCircle/></div><span>5:00</span></div>
      </div>
      <div className="scenario-grid">
        {visibleScenarios.map((scenario) => {
          const { icon: Icon, title, desc, level, time, color } = scenario;
          return <button key={title} className="scenario-card" onClick={() => selectScenario(scenario)}>
            <span className={`scenario-art ${color}`}><Icon/></span>
            <div><span className="level-chip">{level}</span><h3>{title}</h3><p>{desc}</p><div className="scenario-meta"><span><Clock3 size={14}/>{time}</span><span>Começar <ArrowRight size={15}/></span></div></div>
          </button>;
        })}
      </div>
      {visibleScenarios.length === 0 && <p className="form-message">Nenhum cenário encontrado.</p>}
    </div>
  );
}

function Conversation({
  go,
  scenario,
  preferences,
  session,
}: {
  go: (id: ScreenId) => void;
  scenario: Scenario;
  preferences: LearnerPreferences | null;
  session: Session | null;
}) {
  const ScenarioIcon = scenario.icon;
  const level = preferences ? levelLabels[preferences.currentLevel].split(" · ")[0] : scenario.level;
  const targetLanguage = preferences?.targetLanguage || "en";
  const opening = scenarioOpenings[targetLanguage][scenario.id];
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [answer, setAnswer] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");

  const send = async () => {
    const text = answer.trim();
    if (!text || sending) return;
    if (!apiUrl) {
      setError("A URL do backend ainda não foi configurada.");
      return;
    }
    if (!session?.access_token) {
      setError("Sua sessão expirou. Entre novamente para continuar.");
      return;
    }

    const userMessage: ConversationMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text,
    };
    setMessages((current) => [...current, userMessage]);
    setAnswer("");
    setError("");
    setSending(true);

    try {
      const response = await fetch(`${apiUrl}/api/v1/ai/tutor/reply`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: text,
          target_language: targetLanguage,
          learner_level: preferences?.currentLevel === "C1" ? "B2" : preferences?.currentLevel || "unknown",
          scenario: scenario.id,
          request_id: crypto.randomUUID(),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.detail || "Não foi possível obter a resposta do tutor.");
      }
      setMessages((current) => [
        ...current,
        {
          id: payload.request_id,
          role: "tutor",
          text: payload.result.reply,
          correction: payload.result.correction,
        },
      ]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "O tutor está temporariamente indisponível.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="conversation-screen">
      <header className="conversation-header">
        <button onClick={() => go("scenarios")}><ArrowLeft/></button>
        <div className="conversation-title"><span className="mini-avatar">Lu</span><div><strong>{scenario.title}</strong><small><i/> Lume · {level}</small></div></div>
        <div className="session-timer"><Clock3/> 06:42</div>
        <Button variant="ghost" disabled>Encerrar</Button>
      </header>
      <main className="conversation-body">
        <div className="conversation-context"><ScenarioIcon/><div><span>SEU OBJETIVO</span><strong>{scenario.objective}</strong></div><button disabled title="Dicas estarão disponíveis com a conversa por IA">Ver dicas</button></div>
        <div className="conversation-messages">
          <div className="time-divider"><span>Início da prática</span></div>
          <div className="chat-message tutor-message"><div className="mini-avatar">Lu</div><div><span>{opening}</span><button disabled title="Síntese de voz ainda não disponível"><Volume2 size={15}/> Ouvir</button></div></div>
          {messages.map((message) => (
            <div key={message.id}>
              <div className={`chat-message ${message.role === "user" ? "user-message" : "tutor-message"}`}>
                {message.role === "tutor" && <div className="mini-avatar">Lu</div>}
                <div><span>{message.text}</span></div>
              </div>
              {message.correction && (
                <div className="inline-feedback compact-feedback">
                  <div className="feedback-title"><CheckCircle2/><strong>Uma correção para você</strong></div>
                  <div className="compare"><del>{message.correction.original}</del><ArrowRight size={15}/><ins>{message.correction.corrected}</ins></div>
                  <p>{message.correction.explanation_pt_br}</p>
                </div>
              )}
            </div>
          ))}
          {sending && <div className="form-message">Lume está preparando uma resposta...</div>}
          {error && <div className="form-message form-error" role="alert">{error}</div>}
        </div>
        <div className="conversation-compose">
          <div className="hint-row"><button disabled title="Disponível com o tutor de IA"><Sparkles size={15}/> Preciso de uma dica</button><button disabled title="Disponível com o tutor de IA"><Languages size={15}/> Traduzir pergunta</button></div>
          <div className="compose-box"><button className="mic-button" disabled title="Entrada por voz ainda não disponível"><Mic2/></button><textarea aria-label="Responder" value={answer} disabled={sending} onChange={(event) => setAnswer(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="Digite sua resposta no idioma estudado..."/><button className="send-button" disabled={!answer.trim() || sending} onClick={() => void send()} aria-label="Enviar mensagem"><ArrowRight/></button></div>
          <small>Pressione Enter para enviar · Shift + Enter para nova linha</small>
        </div>
      </main>
      <aside className="conversation-side">
        <div><span className="eyebrow">PROGRESSO DA SESSÃO</span><ProgressRing value={64} label="objetivo"/></div>
        <div className="session-goals"><h3>Nesta conversa</h3><p className="done"><CheckCircle2/> Cumprimentar</p><p className="done"><CheckCircle2/> Fazer o pedido</p><p><i/> Perguntar o preço</p></div>
        <div className="live-words"><h3>Palavras desta conversa</h3><p>O vocabulário aparecerá conforme a conversa avançar.</p></div>
      </aside>
    </div>
  );
}

function Summary({ go }: { go: (id: ScreenId) => void }) {
  return (
    <div className="screen-content summary-screen">
      <div className="summary-hero">
        <div className="celebration">✦</div><span className="eyebrow light">SESSÃO CONCLUÍDA</span><h1>Muito bem, Carlos!</h1><p>Você completou o pedido e manteve a conversa em inglês.</p>
        <div className="summary-stats"><div><strong>9:42</strong><span>tempo</span></div><div><strong>12</strong><span>mensagens</span></div><div><strong>4</strong><span>novas palavras</span></div></div>
      </div>
      <div className="summary-layout">
        <main>
          <div className="score-card"><div><span className="eyebrow">DESEMPENHO DA SESSÃO</span><h2>Você está ganhando confiança</h2><p>Seu vocabulário foi claro e você respondeu sem longas pausas.</p></div><ProgressRing value={84} label="sessão"/></div>
          <div className="feedback-grid">
            <article className="strength-card"><div className="card-title"><Star/><strong>Pontos fortes</strong></div><p><Check/> Usou frases completas</p><p><Check/> Respondeu no contexto</p><p><Check/> Manteve um tom educado</p></article>
            <article className="focus-card"><div className="card-title"><Target/><strong>Para melhorar</strong></div><p><span>1</span><div><strong>Tamanhos de bebidas</strong><small>Use “large” em vez de “big”.</small></div></p><p><span>2</span><div><strong>Pedidos mais naturais</strong><small>Prefira “I’d like...” a “I want...”.</small></div></p></article>
          </div>
          <div className="saved-words"><div className="section-heading compact"><div><span className="eyebrow">VOCABULÁRIO</span><h2>Palavras da sessão</h2></div><button onClick={() => go("vocabulary")}>Ver todas</button></div><div>{["whole milk","oat milk","large","How much is it?"].map((word)=><span key={word}>{word}<button disabled title="Síntese de voz ainda não disponível"><Volume2 size={14}/></button></span>)}</div></div>
        </main>
        <aside>
          <div className="next-card"><span className="eyebrow">PRÓXIMO PASSO</span><div className="next-icon"><BookOpen/></div><h3>Revise o que aprendeu</h3><p>Uma revisão rápida ajuda a fixar as quatro novas expressões.</p><Button full onClick={() => go("vocabulary")}>Revisar agora</Button><button onClick={() => go("dashboard")}>Voltar ao início</button></div>
        </aside>
      </div>
    </div>
  );
}

function Assessment({ displayName, preferences }: { displayName: string; preferences: LearnerPreferences | null }) {
  return (
    <div className="screen-content assessment-screen">
      <AppHeader title="Descubra seu nível" subtitle="Uma avaliação curta para personalizar seu plano." displayName={displayName} preferences={preferences}/>
      <div className="assessment-intro">
        <div className="assessment-copy"><span className="eyebrow light">AVALIAÇÃO OPCIONAL</span><h2>Entenda onde você está — sem pressão.</h2><p>Vamos avaliar compreensão, vocabulário e escrita. O resultado é uma estimativa, não uma certificação.</p><div className="assessment-meta"><span><Clock3/> 8–10 minutos</span><span><Target/> 18 questões</span><span><ShieldCheck/> Resultado privado</span></div><Button variant="secondary" disabled>Avaliação em breve</Button></div>
        <div className="level-scale"><span>A1<small>Iniciante</small></span><span className="active">A2<small>Básico</small></span><span>B1<small>Intermediário</small></span><span>B2<small>Independente</small></span></div>
      </div>
      <section className="assessment-details"><h2>Como funciona</h2><div><article><span>01</span><BookOpen/><h3>Compreensão</h3><p>Leia situações curtas e escolha a interpretação mais adequada.</p></article><article><span>02</span><Languages/><h3>Uso do idioma</h3><p>Complete frases e mostre como usaria o inglês no cotidiano.</p></article><article><span>03</span><WandSparkles/><h3>Resultado explicado</h3><p>Veja evidências do seu nível e recomendações para avançar.</p></article></div></section>
      <div className="sample-question"><div><span>EXEMPLO DE QUESTÃO</span><strong>Choose the best response:</strong><p>“Would you like anything else?”</p></div><div><button disabled>A. Yes, I like.</button><button disabled className="correct">B. No, that’s all. Thank you. <Check/></button><button disabled>C. I don’t have.</button></div></div>
    </div>
  );
}

function Progress({ displayName, preferences }: { displayName: string; preferences: LearnerPreferences | null }) {
  return (
    <div className="screen-content">
      <AppHeader title="Seu progresso" subtitle="Evidências reais do que você vem construindo." displayName={displayName} preferences={preferences}/>
      <div className="period-tabs"><button disabled>7 dias</button><button className="active">30 dias</button><button disabled>3 meses</button><button disabled>Todo período</button></div>
      <div className="stats-grid">
        <Stat icon={<Clock3/>} value="8h 10min" label="tempo de estudo" tone="teal"/>
        <Stat icon={<MessageCircle/>} value="18" label="conversas concluídas" tone="coral"/>
        <Stat icon={<BookOpen/>} value="124" label="palavras revisadas" tone="blue"/>
        <Stat icon={<Flame/>} value="7 dias" label="sequência atual" tone="amber"/>
      </div>
      <div className="analytics-grid">
        <section className="chart-card">
          <div className="section-heading compact"><div><span className="eyebrow">ATIVIDADE</span><h2>Minutos estudados</h2></div><span className="trend">+18% este mês</span></div>
          <div className="bar-chart">{[28,42,18,55,68,36,74,52,44,82,61,92].map((height,index)=><div key={index}><i style={{height:`${height}%`}}/><span>{index % 2 ? "" : `${index+1}/7`}</span></div>)}</div>
        </section>
        <section className="skills-card"><span className="eyebrow">HABILIDADES</span><h2>Seu inglês hoje</h2>{[["Conversação",72],["Vocabulário",84],["Gramática",66],["Compreensão",78]].map(([skill,value])=><div key={skill as string}><span>{skill}<strong>{value}%</strong></span><i><b style={{width:`${value}%`}}/></i></div>)}<small>Estimativas baseadas nas suas atividades recentes.</small></section>
      </div>
      <div className="progress-bottom">
        <section className="milestones"><div className="section-heading compact"><h2>Marcos recentes</h2></div><div><span><Trophy/></span><p><strong>7 dias de consistência</strong><small>Conquistado hoje</small></p></div><div><span><MessageCircle/></span><p><strong>15 conversas concluídas</strong><small>Há 3 dias</small></p></div><div><span><BookOpen/></span><p><strong>100 palavras revisadas</strong><small>Há 1 semana</small></p></div></section>
        <section className="error-insights"><div className="section-heading compact"><h2>O que merece atenção</h2></div><p><span>Artigos: a / an / the</span><strong>8 ocorrências</strong></p><p><span>Present simple</span><strong>5 ocorrências</strong></p><p><span>Preposições</span><strong>3 ocorrências</strong></p><small>Use isso como direção, não como nota.</small></section>
      </div>
    </div>
  );
}

function Profile({
  go,
  displayName,
  email,
  preferences,
  saveSettings,
}: {
  go: (id: ScreenId) => void;
  displayName: string;
  email: string;
  preferences: LearnerPreferences | null;
  saveSettings: (name: string, preferences: LearnerPreferences) => Promise<AuthFeedback>;
}) {
  const [section, setSection] = useState<"profile" | "languages" | "plan" | "notifications">("profile");
  const [name, setName] = useState(displayName);
  const [draft, setDraft] = useState<LearnerPreferences>(preferences || {
    targetLanguage: "en",
    currentLevel: "unknown",
    learningGoal: "conversation",
    studyMinutesPerDay: 20,
    studyDaysPerWeek: 5,
  });
  const [feedback, setFeedback] = useState<AuthFeedback>({});
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setFeedback(await saveSettings(name, draft));
    setSaving(false);
  };

  return (
    <div className="screen-content">
      <AppHeader title="Perfil e preferências" subtitle="Ajuste como o Lume ensina você." displayName={displayName} preferences={preferences}/>
      <div className="settings-layout">
        <aside className="settings-nav">
          <button className={section === "profile" ? "active" : ""} onClick={() => setSection("profile")}><CircleUserRound/> Perfil</button>
          <button className={section === "languages" ? "active" : ""} onClick={() => setSection("languages")}><Languages/> Idiomas</button>
          <button className={section === "plan" ? "active" : ""} onClick={() => setSection("plan")}><Target/> Plano e metas</button>
          <button className={section === "notifications" ? "active" : ""} onClick={() => setSection("notifications")}><Bell/> Notificações</button>
          <button onClick={() => go("privacy")}><ShieldCheck/> Dados e privacidade</button>
        </aside>
        <main className="settings-panel">
          {section === "profile" && <>
            <section><div className="profile-heading"><div className="large-avatar">{name.slice(0, 2).toUpperCase()}</div><div><h2>{name || "Aluno"}</h2><p>Minha aprendizagem</p></div></div></section>
            <section><h3>Informações pessoais</h3><div className="form-grid"><label>Nome<input maxLength={100} value={name} onChange={(event) => setName(event.target.value)}/></label><label>Email<input value={email} readOnly/></label></div></section>
          </>}
          {section === "languages" && <section><h3>Idioma e nível</h3><div className="form-grid">
            <label>Idioma estudado<select value={draft.targetLanguage} onChange={(event) => setDraft({...draft, targetLanguage: event.target.value as OnboardingData["targetLanguage"]})}>{Object.entries(languageDetails).map(([value, item]) => <option key={value} value={value}>{item.flag} {item.name}</option>)}</select></label>
            <label>Nível atual<select value={draft.currentLevel} onChange={(event) => setDraft({...draft, currentLevel: event.target.value as OnboardingData["currentLevel"]})}>{selectableLevels.map((value) => <option key={value} value={value}>{levelLabels[value]}</option>)}</select></label>
          </div></section>}
          {section === "plan" && <section><h3>Plano e metas</h3><div className="form-grid">
            <label>Objetivo principal<select value={draft.learningGoal} onChange={(event) => setDraft({...draft, learningGoal: event.target.value as OnboardingData["learningGoal"]})}>{Object.entries(goalLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>Minutos por dia<select value={draft.studyMinutesPerDay} onChange={(event) => setDraft({...draft, studyMinutesPerDay: Number(event.target.value) as OnboardingData["studyMinutesPerDay"]})}>{[10,20,30,60].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutos</option>)}</select></label>
            <label>Dias por semana<select value={draft.studyDaysPerWeek} onChange={(event) => setDraft({...draft, studyDaysPerWeek: Number(event.target.value)})}>{[1,2,3,4,5,6,7].map((days) => <option key={days} value={days}>{days} {days === 1 ? "dia" : "dias"}</option>)}</select></label>
          </div></section>}
          {section === "notifications" && <section><h3>Notificações</h3><p>Os lembretes ainda não são enviados. Essa opção será ativada quando o serviço de notificações estiver disponível.</p></section>}
          {feedback.error && <div className="form-message form-error" role="alert">{feedback.error}</div>}
          {feedback.success && <div className="form-message form-success" role="status">{feedback.success}</div>}
          {section !== "notifications" && <div className="save-row"><Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar alterações"}</Button></div>}
        </main>
      </div>
    </div>
  );
}

function Privacy({
  session,
  accountDeleted,
}: {
  session: Session | null;
  accountDeleted: () => Promise<void>;
}) {
  const [confirmingDeletion, setConfirmingDeletion] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deletionError, setDeletionError] = useState("");
  const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");

  const deleteAccount = async () => {
    if (confirmation !== "EXCLUIR" || deleting) return;
    if (!apiUrl) {
      setDeletionError("A URL do backend ainda não foi configurada.");
      return;
    }
    if (!session?.access_token) {
      setDeletionError("Sua sessão expirou. Entre novamente antes de excluir a conta.");
      return;
    }

    setDeleting(true);
    setDeletionError("");
    try {
      const response = await fetch(`${apiUrl}/api/v1/account`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ confirmation: "EXCLUIR" }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          typeof payload?.detail === "string"
            ? payload.detail
            : "Não foi possível excluir sua conta. Tente novamente.",
        );
      }
      await accountDeleted();
    } catch (requestError) {
      setDeletionError(
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível excluir sua conta. Tente novamente.",
      );
      setDeleting(false);
    }
  };

  const cancelDeletion = () => {
    setConfirmingDeletion(false);
    setConfirmation("");
    setDeletionError("");
  };

  return (
    <div className="screen-content">
      <AppHeader title="Dados e privacidade" subtitle="Você controla o que guardamos sobre sua aprendizagem."/>
      <div className="privacy-layout">
        <main>
          <div className="privacy-principle"><ShieldCheck/><div><span className="eyebrow">NOSSO PRINCÍPIO</span><h2>Seus dados existem para ajudar você — e continuam sendo seus.</h2><p>Áudios são apagados após a transcrição. Você pode baixar ou excluir seus dados a qualquer momento.</p></div></div>
          <section className="data-section"><h2>Seus dados</h2><article><span className="data-icon"><MessageCircle/></span><div><strong>Conversas e correções</strong><p>Usadas para manter seu histórico e personalizar atividades.</p><small>Nenhuma conversa persistida ainda</small></div><button disabled>Gerenciar</button></article><article><span className="data-icon"><WandSparkles/></span><div><strong>Memórias do tutor</strong><p>Objetivos, preferências e dificuldades que você autorizou.</p><small>Memória ainda não ativada</small></div><button disabled>Visualizar</button></article><article><span className="data-icon"><Mic2/></span><div><strong>Gravações de voz</strong><p>Processadas para transcrição e excluídas automaticamente.</p><small className="safe"><CheckCircle2/> Nenhum áudio armazenado</small></div></article></section>
          <section className="export-section"><div><Download/><div><h3>Baixe uma cópia dos seus dados</h3><p>A exportação será implementada junto ao backend.</p></div><Button variant="secondary" disabled>Exportação em breve</Button></div></section>
          <section className="danger-zone">
            <h2>Excluir conta</h2>
            <p>Exclui permanentemente seu acesso, perfil, preferências e histórico de aprendizagem. Esta ação não pode ser desfeita.</p>
            {!confirmingDeletion && <Button variant="danger" onClick={() => setConfirmingDeletion(true)} icon={<Trash2 size={17}/>}>Excluir minha conta</Button>}
            {confirmingDeletion && (
              <div className="account-delete-confirmation">
                <strong>Confirme a exclusão permanente</strong>
                <label>Digite <b>EXCLUIR</b> para continuar<input autoComplete="off" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={deleting}/></label>
                {deletionError && <div className="form-message form-error" role="alert">{deletionError}</div>}
                <div>
                  <Button variant="secondary" onClick={cancelDeletion} disabled={deleting}>Cancelar</Button>
                  <Button variant="danger" onClick={deleteAccount} disabled={confirmation !== "EXCLUIR" || deleting} icon={<Trash2 size={17}/>}>{deleting ? "Excluindo..." : "Excluir permanentemente"}</Button>
                </div>
              </div>
            )}
          </section>
        </main>
        <aside><div className="privacy-summary"><h3>Resumo de privacidade</h3><p><Check/> Áudio não armazenado</p><p><Check/> Dados protegidos por usuário</p><p><Check/> Sem venda de dados pessoais</p><button disabled>Política completa em preparação</button></div><div className="session-card"><LockKeyhole/><h3>Sessão atual</h3><p>Você está conectado neste dispositivo.</p><button disabled>Gerenciamento em breve</button></div></aside>
      </div>
    </div>
  );
}

type LearningMode = "quick_lesson" | "reading" | "grammar" | "review";

function LearningCenter({
  displayName,
  preferences,
  session,
  initialMode = "quick_lesson",
}: {
  displayName: string;
  preferences: LearnerPreferences | null;
  session: Session | null;
  initialMode?: LearningMode;
}) {
  const reviewOnly = initialMode === "review";
  const language = preferences?.targetLanguage || "en";
  const preferredLevel = (["A1", "A2", "B1", "B2"].includes(preferences?.currentLevel || "")
    ? preferences?.currentLevel
    : "A1") as LearningLevel;
  const catalogClient = getSupabaseBrowserClient();
  const [learningContent, setLearningContent] = useState<LearningContent | null>(null);
  const [contentError, setContentError] = useState(
    catalogClient ? "" : "A conexão com o catálogo ainda não está configurada.",
  );
  const [contentVersion, setContentVersion] = useState(0);
  const learning = learningContent || {
    quickLessons: [],
    readings: [],
    grammar: [],
    flashcards: [],
  };
  const [mode, setMode] = useState<LearningMode>(initialMode);
  const [level, setLevel] = useState<LearningLevel>(preferredLevel);
  const [activityIndex, setActivityIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [readingQuestionIndex, setReadingQuestionIndex] = useState(0);
  const [readingCorrectAnswers, setReadingCorrectAnswers] = useState(0);

  useEffect(() => {
    if (!catalogClient) return;
    let active = true;
    const load = async () => {
      setContentError("");
      try {
        const content = await loadLearningContent(catalogClient, language);
        if (active) setLearningContent(content);
      } catch {
        if (active) setContentError("Não foi possível carregar as lições. Tente novamente.");
      }
    };
    void load();
    return () => { active = false; };
  }, [catalogClient, contentVersion, language]);

  const quickLessonActivities = learning.quickLessons.filter((item) => item.level === level);
  const readingActivities = learning.readings.filter((item) => item.level === level);
  const grammarActivities = learning.grammar.filter((item) => item.level === level);
  const quickLessonActivity = mode === "quick_lesson" ? quickLessonActivities[activityIndex] : null;
  const readingActivity = mode === "reading" ? readingActivities[activityIndex] : null;
  const readingQuestion = readingActivity?.questions[readingQuestionIndex];
  const grammarActivity = mode === "grammar" ? grammarActivities[activityIndex] : null;
  const activity = quickLessonActivity || grammarActivity;
  const activityCount = mode === "quick_lesson"
    ? quickLessonActivities.length
    : mode === "reading"
      ? readingActivities.length
      : grammarActivities.length;

  const recordProgress = async (activityId: string, activityType: LearningMode, score: number) => {
    if (!session) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { data: previous } = await supabase
      .from("learning_activity_progress")
      .select("attempts")
      .eq("user_id", session.user.id)
      .eq("activity_id", activityId)
      .maybeSingle();
    const { error } = await supabase.from("learning_activity_progress").upsert({
      user_id: session.user.id,
      activity_id: activityId,
      activity_type: activityType,
      score,
      attempts: (previous?.attempts || 0) + 1,
      completed_at: new Date().toISOString(),
    }, { onConflict: "user_id,activity_id" });
    if (!error) setSaved(true);
  };

  const chooseMode = (nextMode: LearningMode) => {
    setMode(nextMode);
    setSelectedAnswer(null);
    setSaved(false);
    setActivityIndex(0);
    setCardIndex(0);
    setFlipped(false);
    setReadingQuestionIndex(0);
    setReadingCorrectAnswers(0);
  };

  const chooseLevel = (nextLevel: LearningLevel) => {
    setLevel(nextLevel);
    setActivityIndex(0);
    setSelectedAnswer(null);
    setSaved(false);
    setReadingQuestionIndex(0);
    setReadingCorrectAnswers(0);
  };

  const moveActivity = (direction: -1 | 1) => {
    setActivityIndex((current) => {
      const next = current + direction;
      return Math.max(0, Math.min(activityCount - 1, next));
    });
    setSelectedAnswer(null);
    setSaved(false);
    setReadingQuestionIndex(0);
    setReadingCorrectAnswers(0);
  };

  const answerActivity = (index: number) => {
    if (selectedAnswer !== null || !activity) return;
    setSelectedAnswer(index);
    void recordProgress(activity.id, mode, index === activity.answer ? 100 : 0);
  };

  const answerReading = (index: number) => {
    if (selectedAnswer !== null || !readingActivity || !readingQuestion) return;
    const correctAnswers = readingCorrectAnswers + (index === readingQuestion.answer ? 1 : 0);
    setSelectedAnswer(index);
    setReadingCorrectAnswers(correctAnswers);
    if (readingQuestionIndex === readingActivity.questions.length - 1) {
      const score = Math.round((correctAnswers / readingActivity.questions.length) * 100);
      void recordProgress(readingActivity.id, "reading", score);
    }
  };

  const nextReadingQuestion = () => {
    if (!readingActivity || readingQuestionIndex >= readingActivity.questions.length - 1) return;
    setReadingQuestionIndex((current) => current + 1);
    setSelectedAnswer(null);
  };

  const rateCard = (remembered: boolean) => {
    const isLast = cardIndex === learning.flashcards.length - 1;
    void recordProgress(
      `${language}-flashcard-${cardIndex + 1}`,
      "review",
      remembered ? 100 : 50,
    );
    setCardIndex(isLast ? 0 : cardIndex + 1);
    setFlipped(false);
  };

  if (!learningContent) {
    return (
      <div className="screen-content">
        <AppHeader title={reviewOnly ? "Revisar" : "Aprender"} subtitle={reviewOnly ? "Fortaleça o vocabulário que você está aprendendo." : "Lições rápidas, leitura e gramática no seu ritmo."} displayName={displayName} preferences={preferences}/>
        <div className="learning-loading">
          {contentError ? <><BookOpen/><p>{contentError}</p><Button onClick={() => setContentVersion((value) => value + 1)}>Tentar novamente</Button></> : <><Sparkles/><p>Carregando seu catálogo...</p></>}
        </div>
      </div>
    );
  }

  return (
    <div className="screen-content">
      <AppHeader title={reviewOnly ? "Revisar" : "Aprender"} subtitle={reviewOnly ? "Fortaleça o vocabulário que você está aprendendo." : "Lições rápidas, leitura e gramática no seu ritmo."} displayName={displayName} preferences={preferences}/>
      {!reviewOnly && (
        <div className="learning-tabs" role="tablist">
          <button className={mode === "quick_lesson" ? "active" : ""} onClick={() => chooseMode("quick_lesson")}><Zap/> Lição rápida</button>
          <button className={mode === "reading" ? "active" : ""} onClick={() => chooseMode("reading")}><BookOpen/> Leitura</button>
          <button className={mode === "grammar" ? "active" : ""} onClick={() => chooseMode("grammar")}><Languages/> Gramática</button>
        </div>
      )}

      {mode !== "review" && (
        <div className="level-tabs">
          {(["A1", "A2", "B1", "B2"] as LearningLevel[]).map((item) => (
            <button key={item} className={level === item ? "active" : ""} onClick={() => chooseLevel(item)}>{item}</button>
          ))}
        </div>
      )}

      {(mode === "quick_lesson" || mode === "grammar") && activity && (
        <>
          <article className="learning-activity">
            <div className="learning-activity-heading"><span className="level-chip">{level} · {languageDetails[language].name}</span><strong>{activityIndex + 1} de {activityCount}</strong></div>
            <h2>{activity.title}</h2>
            {grammarActivity && <div className="grammar-note"><strong>Como funciona</strong><p>{grammarActivity.explanation}</p><span>{grammarActivity.example}</span></div>}
            {quickLessonActivity && <p className="reading-text">{quickLessonActivity.text}</p>}
            <section className="learning-question">
              <strong>{activity.question}</strong>
              <div>
                {activity.options.map((option, index) => {
                  const answered = selectedAnswer !== null;
                  const className = answered
                    ? index === activity.answer ? "correct" : index === selectedAnswer ? "wrong" : ""
                    : "";
                  return <button key={option} className={className} onClick={() => answerActivity(index)} disabled={answered}>{option}{answered && index === activity.answer && <Check/>}</button>;
                })}
              </div>
              {selectedAnswer !== null && (
                <p className={selectedAnswer === activity.answer ? "answer-success" : "answer-error"}>
                  {selectedAnswer === activity.answer ? "Muito bem! Resposta correta." : "Quase! Observe a resposta destacada e tente novamente depois."}
                  {saved && " Progresso salvo."}
                </p>
              )}
            </section>
            <div className="learning-navigation">
              <Button variant="secondary" disabled={activityIndex === 0} onClick={() => moveActivity(-1)} icon={<ArrowLeft/>}>Anterior</Button>
              <Button disabled={activityIndex === activityCount - 1} onClick={() => moveActivity(1)} icon={<ArrowRight/>}>Próxima</Button>
            </div>
          </article>
        </>
      )}

      {mode === "reading" && readingActivity && readingQuestion && (
        <article className="learning-activity reading-activity">
          <div className="learning-activity-heading">
            <span className="level-chip">{level} · {languageDetails[language].name}</span>
            <strong>Texto {activityIndex + 1} de {activityCount}</strong>
          </div>
          <h2>{readingActivity.title}</h2>
          <div className="reading-passage">
            {readingActivity.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          </div>
          <section className="learning-question reading-comprehension">
            <div className="reading-question-progress">
              <strong>Pergunta {readingQuestionIndex + 1} de {readingActivity.questions.length}</strong>
              <span>{readingCorrectAnswers} acerto{readingCorrectAnswers === 1 ? "" : "s"}</span>
            </div>
            <h3>{readingQuestion.prompt}</h3>
            <div>
              {readingQuestion.options.map((option, index) => {
                const answered = selectedAnswer !== null;
                const className = answered
                  ? index === readingQuestion.answer ? "correct" : index === selectedAnswer ? "wrong" : ""
                  : "";
                return <button key={option} className={className} onClick={() => answerReading(index)} disabled={answered}>{option}{answered && index === readingQuestion.answer && <Check/>}</button>;
              })}
            </div>
            {selectedAnswer !== null && (
              <div className="reading-feedback">
                <p className={selectedAnswer === readingQuestion.answer ? "answer-success" : "answer-error"}>
                  {selectedAnswer === readingQuestion.answer ? "Muito bem! Resposta correta." : "A resposta correta está destacada."}
                </p>
                <p>{readingQuestion.explanation}</p>
                {readingQuestionIndex < readingActivity.questions.length - 1
                  ? <Button onClick={nextReadingQuestion} icon={<ArrowRight/>}>Próxima pergunta</Button>
                  : <strong>Leitura concluída: {Math.round((readingCorrectAnswers / readingActivity.questions.length) * 100)}%{saved && " · progresso salvo"}</strong>}
              </div>
            )}
          </section>
          <div className="learning-navigation">
            <Button variant="secondary" disabled={activityIndex === 0} onClick={() => moveActivity(-1)} icon={<ArrowLeft/>}>Texto anterior</Button>
            <Button disabled={activityIndex === activityCount - 1} onClick={() => moveActivity(1)} icon={<ArrowRight/>}>Próximo texto</Button>
          </div>
        </article>
      )}

      {mode === "review" && (
        <div className="quick-lesson">
          <div className="quick-lesson-progress"><span>50 cartões · dificuldade progressiva</span><strong>{cardIndex + 1}/{learning.flashcards.length}</strong></div>
          <button className={`learning-flashcard${flipped ? " flipped" : ""}`} onClick={() => setFlipped(!flipped)}>
            <small>{flipped ? "SIGNIFICADO" : languageDetails[language].name.toUpperCase()}</small>
            <strong>{flipped ? learning.flashcards[cardIndex].back : learning.flashcards[cardIndex].front}</strong>
            <span>{flipped ? "Você lembrou?" : "Toque para virar"}</span>
          </button>
          {flipped && <div className="quick-lesson-actions"><Button variant="secondary" onClick={() => rateCard(false)}>Revisar depois</Button><Button onClick={() => rateCard(true)}>Eu lembrei</Button></div>}
        </div>
      )}
    </div>
  );
}

function AppNav({
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
  const navItems: Array<[ScreenId, string, IconType]> = [
    ["dashboard", "Início", Home],
    ["learn", "Aprender", GraduationCap],
    ["plan", "Meu plano", Map],
    ["scenarios", "Conversar", MessageCircle],
    ["vocabulary", "Revisar", RotateCcw],
    ["progress", "Progresso", BarChart3],
  ];
  return (
    <>
      <aside className="app-sidebar">
        <Brand onClick={() => go("dashboard")}/>
        <nav>{navItems.map(([id,label,Icon])=><button key={id} className={current === id ? "active" : ""} onClick={() => go(id)}><Icon/><span>{label}</span>{id === "vocabulary" && <i>12</i>}</button>)}</nav>
        <div className="sidebar-bottom"><button onClick={() => go("profile")}><Settings/><span>Configurações</span></button><div className="mini-profile"><span>{displayName.slice(0, 2).toUpperCase()}</span><div><strong>{displayName}</strong><small>Minha aprendizagem</small></div><button className="signout-button" onClick={signOut} title="Sair"><LogIn/></button></div></div>
      </aside>
      <nav className="mobile-nav">
        {navItems.map(([id,label,Icon])=><button key={id} className={current === id ? "active" : ""} onClick={() => go(id)}><Icon/><span>{label === "Meu plano" ? "Plano" : label}</span></button>)}
        <button className={current === "profile" ? "active" : ""} onClick={() => go("profile")}><Settings/><span>Ajustes</span></button>
        <button onClick={signOut} title="Sair"><LogIn/><span>Sair</span></button>
      </nav>
    </>
  );
}

function PrototypeNavigator({
  current,
  go,
}: {
  current: ScreenId;
  go: (id: ScreenId) => void;
}) {
  const [open, setOpen] = useState(false);
  const currentIndex = screens.findIndex((screen) => screen.id === current);
  return (
    <>
      <button className="prototype-trigger" onClick={() => setOpen(!open)}>
        <Map size={17}/><span>Mapa de telas</span><strong>{currentIndex + 1}/16</strong>
      </button>
      {open && (
        <div className="prototype-panel">
          <div className="prototype-head"><div><strong>Protótipo navegável</strong><span>{screens.length} telas do produto</span></div><button onClick={() => setOpen(false)}><X/></button></div>
          {["Entrada","Produto","Progresso","Conta"].map((group)=><div className="prototype-group" key={group}><span>{group}</span>{screens.filter((screen)=>screen.group===group).map(({id,label,icon:Icon})=><button key={id} className={current===id?"active":""} onClick={()=>{go(id);setOpen(false)}}><Icon size={17}/>{label}{current===id&&<Check size={15}/>}</button>)}</div>)}
          <div className="prototype-arrows"><button disabled={currentIndex===0} onClick={()=>go(screens[Math.max(0,currentIndex-1)].id)}><ArrowLeft/> Anterior</button><button disabled={currentIndex===screens.length-1} onClick={()=>go(screens[Math.min(screens.length-1,currentIndex+1)].id)}>Próxima <ArrowRight/></button></div>
        </div>
      )}
    </>
  );
}

export default function ProductPrototype() {
  const [screen, setScreen] = useState<ScreenId>("landing");
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [displayName, setDisplayName] = useState("Aluno");
  const [preferences, setPreferences] = useState<LearnerPreferences | null>(null);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState<Scenario>(scenarioData[0]);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      const frame = window.requestAnimationFrame(() => setAuthLoading(false));
      return () => window.cancelAnimationFrame(frame);
    }

    let active = true;
    let suppressSignedOutRedirect = false;
    const initialize = async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;

      let currentSession = data.session;
      if (currentSession && !isEmailConfirmed(currentSession.user)) {
        const unconfirmedEmail = currentSession.user.email?.trim().toLowerCase() || "";
        if (unconfirmedEmail) window.sessionStorage.setItem("lume:pending-email", unconfirmedEmail);
        suppressSignedOutRedirect = true;
        await supabase.auth.signOut({ scope: "local" });
        currentSession = null;
      }
      setSession(currentSession);
      const storedPendingEmail = window.sessionStorage.getItem("lume:pending-email") || "";
      const isEmailConfirmation = window.location.hash.includes("type=signup") || window.location.search.includes("type=signup");
      const isPasswordReset = isPasswordRecoveryCallback(window.location.hash, window.location.search);
      let currentOnboardingCompleted = false;
      const storedScenarioId = currentSession
        ? window.sessionStorage.getItem(scenarioStorageKey(currentSession.user.id))
        : null;
      const storedScenario = scenarioData.find(({ id }) => id === storedScenarioId);
      if (storedScenario) setSelectedScenario(storedScenario);
      setPendingEmail(storedPendingEmail);
      if (currentSession) {
        setDisplayName(currentSession.user.user_metadata.display_name || currentSession.user.email?.split("@")[0] || "Aluno");
        const [{ data: profile }, { data: preferencesRow }] = await Promise.all([
          supabase
            .from("profiles")
            .select("display_name,onboarding_completed")
            .eq("id", currentSession.user.id)
            .maybeSingle(),
          supabase
            .from("learner_preferences")
            .select("target_language,current_level,learning_goal,study_minutes_per_day,study_days_per_week")
            .eq("user_id", currentSession.user.id)
            .maybeSingle(),
        ]);
        if (profile?.display_name) setDisplayName(profile.display_name);
        currentOnboardingCompleted = Boolean(profile?.onboarding_completed && preferencesRow);
        setOnboardingCompleted(currentOnboardingCompleted);
        setPreferences(preferencesRow ? mapLearnerPreferences(preferencesRow as LearnerPreferencesRow) : null);
      }

      const fromHash = window.location.hash.replace("#/", "") as ScreenId;
      if (currentSession && isPasswordReset) {
        setPasswordRecovery(true);
        setScreen("recover");
        window.history.replaceState(null, "", "#/recover");
      } else if (currentSession && (storedPendingEmail || isEmailConfirmation)) {
        window.sessionStorage.removeItem("lume:pending-email");
        setPendingEmail("");
        setScreen("onboarding");
        window.history.replaceState(null, "", "#/onboarding");
      } else if (screens.some((item) => item.id === fromHash)) {
        const destination = resolveDestination(fromHash, Boolean(currentSession), currentOnboardingCompleted) as ScreenId;
        setScreen(destination);
        if (destination !== fromHash) window.history.replaceState(null, "", `#/${destination}`);
      }
      setAuthLoading(false);
    };

    void initialize();
    const { data: authListener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "SIGNED_OUT") {
        setSession(null);
        if (suppressSignedOutRedirect) {
          suppressSignedOutRedirect = false;
          return;
        }
        setPreferences(null);
        setOnboardingCompleted(false);
        setDisplayName("Aluno");
        setScreen("login");
        window.history.replaceState(null, "", "#/login");
        return;
      }
      if (nextSession && !isEmailConfirmed(nextSession.user)) {
        const unconfirmedEmail = nextSession.user.email?.trim().toLowerCase() || "";
        if (unconfirmedEmail) {
          window.sessionStorage.setItem("lume:pending-email", unconfirmedEmail);
          setPendingEmail(unconfirmedEmail);
        }
        setSession(null);
        setScreen("confirm-email");
        window.history.replaceState(null, "", "#/confirm-email");
        suppressSignedOutRedirect = true;
        window.setTimeout(() => void supabase.auth.signOut({ scope: "local" }), 0);
        return;
      }
      setSession(nextSession);
      if (nextSession) {
        setDisplayName(nextSession.user.user_metadata.display_name || nextSession.user.email?.split("@")[0] || "Aluno");
      }
      if (event === "PASSWORD_RECOVERY") {
        setPasswordRecovery(true);
        setScreen("recover");
        window.history.replaceState(null, "", "#/recover");
      }
      const isEmailConfirmation = window.location.hash.includes("type=signup") || window.location.search.includes("type=signup");
      if (event === "SIGNED_IN" && nextSession && (window.sessionStorage.getItem("lume:pending-email") || isEmailConfirmation)) {
        window.sessionStorage.removeItem("lume:pending-email");
        setPendingEmail("");
        setScreen("onboarding");
        window.history.replaceState(null, "", "#/onboarding");
      }
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (authLoading) return;
    const restoreNavigation = () => {
      const requested = window.location.hash.replace("#/", "") as ScreenId;
      if (!screens.some(({ id }) => id === requested)) return;
      const destination = resolveDestination(requested, Boolean(session), onboardingCompleted) as ScreenId;
      setScreen(destination);
      if (destination !== requested) window.history.replaceState(null, "", `#/${destination}`);
    };
    window.addEventListener("popstate", restoreNavigation);
    return () => window.removeEventListener("popstate", restoreNavigation);
  }, [authLoading, onboardingCompleted, session]);

  const navigate = (id: ScreenId, replace = false) => {
    setScreen(id);
    window.history[replace ? "replaceState" : "pushState"](null, "", `#/${id}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const go = (id: ScreenId) => {
    const destination = resolveDestination(id, Boolean(session), onboardingCompleted) as ScreenId;
    if (screen === "confirm-email" && (destination === "login" || destination === "signup")) {
      window.sessionStorage.removeItem("lume:pending-email");
      setPendingEmail("");
    }
    navigate(destination);
  };

  const selectScenario = (scenario: Scenario) => {
    setSelectedScenario(scenario);
    if (session) window.sessionStorage.setItem(scenarioStorageKey(session.user.id), scenario.id);
    navigate("conversation");
  };

  const submitAuth = async (mode: AuthMode, form: AuthFormData): Promise<AuthFeedback> => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      return { error: "Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY para ativar a autenticação." };
    }

    if (mode === "update") {
      const { error } = await supabase.auth.updateUser({ password: form.password });
      if (error) return { error: error.message };
      setPasswordRecovery(false);
      window.history.replaceState(null, "", window.location.pathname);
      navigate(onboardingCompleted ? "dashboard" : "onboarding");
      return { success: "Senha atualizada com sucesso." };
    }

    if (mode === "recover") {
      const { error } = await supabase.auth.resetPasswordForEmail(form.email, {
        redirectTo: passwordRecoveryRedirectUrl(window.location.origin),
      });
      return error
        ? { error: error.message }
        : { success: "Se existir uma conta com esse email, enviaremos um link de recuperação." };
    }

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: {
            display_name: form.name.trim(),
            terms_accepted: true,
            privacy_policy_version: "2026-07-28",
          },
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) return { error: error.message };
      if (!data.session || !isEmailConfirmed(data.user)) {
        const normalizedEmail = form.email.trim().toLowerCase();
        window.sessionStorage.setItem("lume:pending-email", normalizedEmail);
        setPendingEmail(normalizedEmail);
        if (data.session) {
          await supabase.auth.signOut({ scope: "local" });
        }
        navigate("confirm-email");
        return {};
      }
      setSession(data.session);
      setDisplayName(form.name.trim() || "Aluno");
      navigate("onboarding");
      return {};
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: form.email,
      password: form.password,
    });
    if (error) return { error: error.message };
    if (!isEmailConfirmed(data.user)) {
      const normalizedEmail = form.email.trim().toLowerCase();
      window.sessionStorage.setItem("lume:pending-email", normalizedEmail);
      setPendingEmail(normalizedEmail);
      await supabase.auth.signOut({ scope: "local" });
      navigate("confirm-email");
      return {};
    }

    setSession(data.session);
    setDisplayName(data.user.user_metadata.display_name || data.user.email?.split("@")[0] || "Aluno");
    const [{ data: profile, error: profileError }, { data: preferencesRow, error: preferencesError }] = await Promise.all([
      supabase
        .from("profiles")
        .select("display_name,onboarding_completed")
        .eq("id", data.user.id)
        .maybeSingle(),
      supabase
        .from("learner_preferences")
        .select("target_language,current_level,learning_goal,study_minutes_per_day,study_days_per_week")
        .eq("user_id", data.user.id)
        .maybeSingle(),
    ]);

    if (profileError || preferencesError) return { error: "Login realizado, mas não foi possível carregar seu perfil." };
    if (profile?.display_name) setDisplayName(profile.display_name);
    const hasCompletedOnboarding = Boolean(profile?.onboarding_completed && preferencesRow);
    setOnboardingCompleted(hasCompletedOnboarding);
    setPreferences(preferencesRow ? mapLearnerPreferences(preferencesRow as LearnerPreferencesRow) : null);
    navigate(hasCompletedOnboarding ? "dashboard" : "onboarding");
    return {};
  };

  const resendConfirmation = async (email: string): Promise<AuthFeedback> => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return { error: "A autenticação ainda não está configurada." };

    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: window.location.origin },
    });

    return error
      ? { error: error.message }
      : { success: "Um novo link foi enviado. Verifique sua caixa de entrada." };
  };

  const checkConfirmation = async (): Promise<AuthFeedback> => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return { error: "A autenticação ainda não está configurada." };
    const [{ data: sessionData }, { data: userData, error: userError }] = await Promise.all([
      supabase.auth.getSession(),
      supabase.auth.getUser(),
    ]);

    if (userError || !sessionData.session || !isEmailConfirmed(userData.user)) {
      return { error: "Ainda não identificamos a confirmação. Abra o link no mesmo navegador e tente novamente." };
    }

    window.sessionStorage.removeItem("lume:pending-email");
    setPendingEmail("");
    setSession(sessionData.session);
    navigate("onboarding");
    return {};
  };

  const completeOnboarding = async (data: OnboardingData): Promise<AuthFeedback> => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !session) {
      go("login");
      return { error: "Sua sessão expirou. Entre novamente para continuar." };
    }

    const { error } = await supabase.rpc("save_learner_settings", {
      p_display_name: displayName,
      p_target_language: data.targetLanguage,
      p_current_level: data.currentLevel,
      p_learning_goal: data.learningGoal,
      p_study_minutes_per_day: data.studyMinutesPerDay,
      p_study_days_per_week: 5,
      p_complete_onboarding: true,
    });
    if (error) return { error: "Não foi possível concluir o onboarding. Tente novamente." };

    setPreferences({ ...data, studyDaysPerWeek: 5 });
    setOnboardingCompleted(true);
    navigate("dashboard");
    return {};
  };

  const saveSettings = async (name: string, nextPreferences: LearnerPreferences): Promise<AuthFeedback> => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !session) return { error: "Sua sessão expirou. Entre novamente." };
    const normalizedName = name.trim();
    if (!normalizedName) return { error: "Informe um nome para o perfil." };

    const { error } = await supabase.rpc("save_learner_settings", {
      p_display_name: normalizedName,
      p_target_language: nextPreferences.targetLanguage,
      p_current_level: nextPreferences.currentLevel,
      p_learning_goal: nextPreferences.learningGoal,
      p_study_minutes_per_day: nextPreferences.studyMinutesPerDay,
      p_study_days_per_week: nextPreferences.studyDaysPerWeek,
      p_complete_onboarding: false,
    });
    if (error) return { error: "Não foi possível salvar as alterações. Tente novamente." };

    // Metadata is only a fallback display source. The transactional profile is authoritative.
    await supabase.auth.updateUser({ data: { display_name: normalizedName } });
    setDisplayName(normalizedName);
    setPreferences(nextPreferences);
    return { success: "Alterações salvas." };
  };

  const signOut = async () => {
    const supabase = getSupabaseBrowserClient();
    if (supabase) await supabase.auth.signOut();
    setSession(null);
    setPreferences(null);
    setOnboardingCompleted(false);
    go("landing");
  };

  const accountDeleted = async () => {
    if (session?.user.id) {
      const onboardingKeys = onboardingStorageKeys(session.user.id);
      localStorage.removeItem(onboardingKeys.draft);
      localStorage.removeItem(onboardingKeys.step);
      localStorage.removeItem(scenarioStorageKey(session.user.id));
    }
    await signOut();
  };

  const content = (() => {
    if (authLoading) {
      return <div className="app-loading"><Sparkles/><span>Preparando seu espaço...</span></div>;
    }
    switch (screen) {
      case "landing": return <Landing go={go}/>;
      case "demo": return <Demo go={go}/>;
      case "signup": return <AuthScreen mode="signup" go={go} submit={submitAuth}/>;
      case "login": return <AuthScreen mode="login" go={go} submit={submitAuth}/>;
      case "recover": return <AuthScreen mode={passwordRecovery ? "update" : "recover"} go={go} submit={submitAuth}/>;
      case "confirm-email": return <ConfirmEmail email={pendingEmail} go={go} resend={resendConfirmation} checkConfirmation={checkConfirmation}/>;
      case "onboarding": return <Onboarding complete={completeOnboarding} go={go} initialPreferences={preferences} userId={session?.user.id || "anonymous"}/>;
      case "dashboard": return <Dashboard go={go} displayName={displayName} preferences={preferences} session={session} startScenario={selectScenario}/>;
      case "learn": return <LearningCenter key="learn" displayName={displayName} preferences={preferences} session={session}/>;
      case "plan": return <Plan go={go} displayName={displayName} preferences={preferences} startScenario={selectScenario}/>;
      case "scenarios": return <Scenarios displayName={displayName} preferences={preferences} selectScenario={selectScenario}/>;
      case "conversation": return <Conversation go={go} scenario={selectedScenario} preferences={preferences} session={session}/>;
      case "summary": return <Summary go={go}/>;
      case "vocabulary": return <LearningCenter key="review" displayName={displayName} preferences={preferences} session={session} initialMode="review"/>;
      case "assessment": return <Assessment displayName={displayName} preferences={preferences}/>;
      case "progress": return <Progress displayName={displayName} preferences={preferences}/>;
      case "profile": return <Profile go={go} displayName={displayName} email={session?.user.email || ""} preferences={preferences} saveSettings={saveSettings}/>;
      case "privacy": return <Privacy session={session} accountDeleted={accountDeleted}/>;
    }
  })();

  return (
    <div className={appScreens.has(screen) ? "app-shell" : "public-page"}>
      {appScreens.has(screen) && screen !== "conversation" && <AppNav current={screen} go={go} displayName={displayName} signOut={signOut}/>}
      <div className={appScreens.has(screen) && screen !== "conversation" ? "app-main" : "full-main"}>{content}</div>
      {process.env.NODE_ENV === "development" && <PrototypeNavigator current={screen} go={go}/>}
    </div>
  );
}
