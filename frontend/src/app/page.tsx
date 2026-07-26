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

type ScreenId =
  | "landing"
  | "demo"
  | "signup"
  | "login"
  | "recover"
  | "onboarding"
  | "dashboard"
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

type OnboardingData = {
  targetLanguage: "en" | "es" | "fr" | "it";
  currentLevel: "A1" | "A2" | "B1" | "B2" | "C1" | "unknown";
  learningGoal: "travel" | "career" | "conversation" | "exam";
  studyMinutesPerDay: 10 | 20 | 30 | 45;
};

const screens: Array<{ id: ScreenId; label: string; icon: IconType; group: string }> = [
  { id: "landing", label: "Landing", icon: Sparkles, group: "Entrada" },
  { id: "demo", label: "Demonstração", icon: MessageCircle, group: "Entrada" },
  { id: "signup", label: "Cadastro", icon: UserPlus, group: "Entrada" },
  { id: "login", label: "Login", icon: LogIn, group: "Entrada" },
  { id: "recover", label: "Recuperar senha", icon: Mail, group: "Entrada" },
  { id: "onboarding", label: "Onboarding", icon: Target, group: "Entrada" },
  { id: "dashboard", label: "Início", icon: Home, group: "Produto" },
  { id: "plan", label: "Plano", icon: Map, group: "Produto" },
  { id: "scenarios", label: "Cenários", icon: Globe2, group: "Produto" },
  { id: "conversation", label: "Conversa", icon: Mic2, group: "Produto" },
  { id: "summary", label: "Resumo", icon: CheckCircle2, group: "Produto" },
  { id: "vocabulary", label: "Vocabulário", icon: BookOpen, group: "Produto" },
  { id: "assessment", label: "Avaliação", icon: GraduationCap, group: "Progresso" },
  { id: "progress", label: "Progresso", icon: BarChart3, group: "Progresso" },
  { id: "profile", label: "Perfil", icon: Settings, group: "Conta" },
  { id: "privacy", label: "Dados e privacidade", icon: ShieldCheck, group: "Conta" },
];

const appScreens = new Set<ScreenId>([
  "dashboard",
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

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <button className="brand" aria-label="Ir para início" data-compact={compact}>
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
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "dark" | "danger";
  icon?: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  full?: boolean;
}) {
  return (
    <button
      type={type}
      className={`button button-${variant}${full ? " button-full" : ""}`}
      onClick={onClick}
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
  return (
    <main className="landing">
      <header className="public-header">
        <Brand />
        <nav>
          <button onClick={() => go("scenarios")}>Como funciona</button>
          <button onClick={() => go("plan")}>Plano de estudo</button>
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

      <section className="value-strip">
        <article><MessageCircle /><strong>Converse de verdade</strong><span>Cenários que você vai usar.</span></article>
        <article><WandSparkles /><strong>Correção na hora</strong><span>Clara, gentil e contextual.</span></article>
        <article><Map /><strong>Plano só seu</strong><span>Adaptado à sua rotina.</span></article>
        <article><BarChart3 /><strong>Progresso visível</strong><span>Sem métricas vazias.</span></article>
      </section>
    </main>
  );
}

function Demo({ go }: { go: (id: ScreenId) => void }) {
  return (
    <div className="public-shell demo-shell">
      <header className="simple-header"><Brand /><span className="step-label">Demonstração · 2 de 3</span><button onClick={() => go("landing")}><X /></button></header>
      <main className="demo-main">
        <div className="demo-context">
          <span className="scenario-icon"><Coffee /></span>
          <div><small>CENÁRIO</small><h2>Pedido em uma cafeteria</h2><p>Pratique uma situação comum em inglês.</p></div>
          <span className="level-chip">A2</span>
        </div>
        <div className="chat-stream">
          <div className="chat-message tutor-message"><div className="mini-avatar">Lu</div><div><span>Good morning! What can I get for you today?</span><button><Volume2 size={15} /> Ouvir</button></div></div>
          <div className="chat-message user-message"><div><span>I want one coffee with milk, please.</span><small>Agora</small></div></div>
          <div className="inline-feedback">
            <div className="feedback-title"><CheckCircle2 /><strong>Boa resposta!</strong><span>1 ajuste</span></div>
            <div className="compare"><del>I want one coffee</del><ArrowRight size={15}/><ins>I’d like a coffee</ins></div>
            <p>Em pedidos, <strong>“I’d like...”</strong> soa mais natural e educado.</p>
            <button>Tentar novamente <RotateCcw size={14} /></button>
          </div>
          <div className="chat-message tutor-message"><div className="mini-avatar">Lu</div><div><span>Great choice! Would you like it hot or iced?</span></div></div>
        </div>
        <div className="demo-composer">
          <button className="mic-button"><Mic2 /></button>
          <input aria-label="Sua resposta" placeholder="Digite sua resposta em inglês..." />
          <button className="send-button"><ArrowRight /></button>
        </div>
        <small className="demo-note">Você tem mais 1 interação grátis</small>
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
        <Brand />
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
          {mode !== "recover" && <label>Senha<div className="password-wrap"><input required minLength={8} type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} value={form.password} onChange={(event) => setForm({...form, password: event.target.value})} placeholder="Mínimo de 8 caracteres" /><LockKeyhole size={17}/></div></label>}
          {mode === "login" && <button type="button" className="forgot" onClick={() => go("recover")}>Esqueci minha senha</button>}
          {mode === "signup" && <label className="check-label"><input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)}/> <span>Li e aceito os Termos e a Política de Privacidade.</span></label>}
          {feedback.error && <div className="form-message form-error" role="alert">{feedback.error}</div>}
          {feedback.success && <div className="form-message form-success" role="status">{feedback.success}</div>}
          <Button full type="submit" icon={submitting ? undefined : <ArrowRight size={18}/>}>{submitting ? "Aguarde..." : copy.action}</Button>
          {(mode === "signup" || mode === "login") && <p className="auth-switch">{mode === "signup" ? "Já tem uma conta?" : "Ainda não tem uma conta?"} <button type="button" onClick={() => go(mode === "signup" ? "login" : "signup")}>{mode === "signup" ? "Entrar" : "Criar conta"}</button></p>}
        </form>
      </main>
    </div>
  );
}

function Onboarding({
  complete,
}: {
  complete: (data: OnboardingData) => Promise<AuthFeedback>;
}) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<OnboardingData>({
    targetLanguage: "en",
    currentLevel: "unknown",
    learningGoal: "conversation",
    studyMinutesPerDay: 20,
  });
  const [feedback, setFeedback] = useState<AuthFeedback>({});
  const [submitting, setSubmitting] = useState(false);
  const questions = [
    { title: "Qual idioma você quer aprender primeiro?", subtitle: "Você poderá adicionar outros idiomas quando quiser." },
    { title: "Como está seu nível hoje?", subtitle: "Não se preocupe: você poderá fazer uma avaliação depois." },
    { title: "Qual é seu principal objetivo?", subtitle: "Usaremos isso para priorizar cenários e vocabulário." },
    { title: "Quanto tempo cabe na sua rotina?", subtitle: "Uma meta realista funciona melhor do que uma meta perfeita." },
  ];
  const next = async () => {
    if (step < 4) {
      setStep(step + 1);
      return;
    }
    setSubmitting(true);
    setFeedback(await complete(data));
    setSubmitting(false);
  };

  return (
    <div className="onboarding-shell">
      <header className="simple-header"><Brand/><span className="step-label">Passo {step} de 4</span><span /></header>
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
            ["C1 · Avançado", "Uso o idioma com autonomia", "C1"],
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
          {([10, 20, 30, 45] as const).map((minutes) => (
            <button key={minutes} className={data.studyMinutesPerDay === minutes ? "selected" : ""} onClick={() => setData({...data, studyMinutesPerDay: minutes})}>
              <div><strong>{minutes} minutos por dia</strong><small>{minutes <= 10 ? "Uma rotina leve" : minutes <= 20 ? "Recomendado para consistência" : "Para avançar mais rápido"}</small></div>{data.studyMinutesPerDay === minutes && <CheckCircle2/>}
            </button>
          ))}
        </div>}
        {feedback.error && <div className="form-message form-error" role="alert">{feedback.error}</div>}
        <div className="onboarding-actions">
          <Button variant="ghost" onClick={() => setStep(Math.max(1, step - 1))}><ArrowLeft size={18}/> Voltar</Button>
          <Button onClick={next} icon={submitting ? undefined : <ArrowRight size={18}/>}>{submitting ? "Salvando..." : step === 4 ? "Criar meu plano" : "Continuar"}</Button>
        </div>
      </main>
    </div>
  );
}

function AppHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="app-header">
      <div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
      <div className="app-header-tools">
        <button className="language-switch"><span>🇺🇸</span> Inglês <ChevronRight size={15}/></button>
        <button className="icon-button"><Bell size={20}/><i/></button>
        <div className="user-avatar">CA</div>
      </div>
    </header>
  );
}

function Dashboard({ go, displayName }: { go: (id: ScreenId) => void; displayName: string }) {
  return (
    <div className="screen-content">
      <AppHeader title={`Olá, ${displayName}!`} subtitle="Um pequeno passo hoje mantém seu idioma em movimento."/>
      <div className="streak-banner">
        <div className="streak-main"><span><Flame/></span><div><small>SEQUÊNCIA ATUAL</small><strong>7 dias</strong></div></div>
        <div className="week-dots">{["S","T","Q","Q","S","S","D"].map((day, index)=><div key={`${day}-${index}`} className={index < 6 ? "done" : ""}><span>{day}</span><i>{index < 6 ? <Check size={12}/> : ""}</i></div>)}</div>
        <p>Você estudou <strong>4 de 5 dias</strong> nesta semana.</p>
      </div>
      <section className="dashboard-grid">
        <div className="main-column">
          <div className="section-heading"><div><span className="eyebrow">PRÓXIMA ATIVIDADE</span><h2>Continue seu plano</h2></div><button onClick={() => go("plan")}>Ver plano completo <ArrowRight size={16}/></button></div>
          <article className="next-lesson">
            <div className="lesson-visual"><div className="coffee-cup">☕</div><span>Conversação</span></div>
            <div className="lesson-copy"><span className="level-chip">A2 · COTIDIANO</span><h3>Um café, por favor</h3><p>Pratique pedidos, tamanhos e preferências em uma cafeteria.</p><div className="lesson-meta"><span><Clock3 size={16}/> 10 min</span><span><MessageCircle size={16}/> Conversa guiada</span></div><Button onClick={() => go("conversation")} icon={<Play size={17} fill="currentColor"/>}>Começar atividade</Button></div>
            <ProgressRing value={35} label="semana"/>
          </article>
          <div className="section-heading compact"><h2>Pratique do seu jeito</h2></div>
          <div className="quick-grid">
            <button onClick={() => go("scenarios")}><span className="quick-icon coral"><MessageCircle/></span><div><strong>Conversar</strong><small>Escolha um cenário</small></div><ChevronRight/></button>
            <button onClick={() => go("vocabulary")}><span className="quick-icon teal"><BookOpen/></span><div><strong>Revisar</strong><small>12 palavras para hoje</small></div><ChevronRight/></button>
            <button onClick={() => go("assessment")}><span className="quick-icon blue"><GraduationCap/></span><div><strong>Avaliar nível</strong><small>Teste rápido opcional</small></div><ChevronRight/></button>
          </div>
        </div>
        <aside className="side-column">
          <div className="goal-card"><div className="card-title"><Target/><strong>Meta mensal</strong><span>Julho</span></div><ProgressRing value={68} label="concluído"/><p><strong>8h 10min</strong> de 12 horas</p><small>Você está no ritmo certo.</small></div>
          <div className="review-card"><div className="card-title"><Zap/><strong>Revisão inteligente</strong></div><h3>12 palavras esperam por você</h3><p>Uma revisão de 4 minutos mantém sua memória fresca.</p><Button variant="secondary" full onClick={() => go("vocabulary")}>Revisar agora</Button></div>
        </aside>
      </section>
    </div>
  );
}

function Plan({ go }: { go: (id: ScreenId) => void }) {
  const days = [
    { day: "SEG", date: "20", done: true, title: "Apresentações", type: "Conversa", time: "10 min" },
    { day: "TER", date: "21", done: true, title: "Revisão de vocabulário", type: "Revisão", time: "8 min" },
    { day: "QUA", date: "22", active: true, title: "Um café, por favor", type: "Conversa", time: "10 min" },
    { day: "QUI", date: "23", title: "Present simple", type: "Gramática", time: "15 min" },
    { day: "SEX", date: "24", title: "Minha rotina", type: "Escrita", time: "10 min" },
  ];
  return (
    <div className="screen-content">
      <AppHeader title="Seu plano de estudo" subtitle="Semana de 20 a 26 de julho"/>
      <div className="plan-overview">
        <div><span className="eyebrow">META DO MÊS</span><h2>Conversar com confiança em situações cotidianas</h2><p>Baseado no seu nível A2 e em 20 minutos por dia.</p></div>
        <div className="plan-progress"><strong>68%</strong><div><i/></div><span>8h 10min de 12h</span></div>
        <button><Settings size={18}/> Ajustar plano</button>
      </div>
      <div className="week-layout">
        <section className="week-list">
          <div className="section-heading compact"><h2>Esta semana</h2><span>3 de 5 atividades</span></div>
          {days.map((item) => (
            <article key={item.day} className={`day-row${item.active ? " active" : ""}${item.done ? " complete" : ""}`}>
              <div className="date-block"><span>{item.day}</span><strong>{item.date}</strong></div>
              <span className="timeline-dot">{item.done ? <Check size={16}/> : item.active ? <Play size={15}/> : ""}</span>
              <div className="day-copy"><span>{item.type}</span><h3>{item.title}</h3><small><Clock3 size={14}/> {item.time}</small></div>
              {item.active ? <Button onClick={() => go("conversation")}>Começar</Button> : <button className="more-button">•••</button>}
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

const scenarioData = [
  { icon: Coffee, title: "Na cafeteria", desc: "Faça pedidos e fale sobre preferências.", level: "A2", time: "10 min", color: "coral" },
  { icon: Plane, title: "No aeroporto", desc: "Check-in, bagagem e orientações.", level: "A2", time: "12 min", color: "blue" },
  { icon: BriefcaseBusiness, title: "Entrevista de emprego", desc: "Conte sua experiência e objetivos.", level: "B1", time: "15 min", color: "teal" },
  { icon: Utensils, title: "No restaurante", desc: "Reserve, escolha e peça a conta.", level: "A2", time: "10 min", color: "amber" },
  { icon: Globe2, title: "Conversa livre", desc: "Escolha qualquer assunto com o tutor.", level: "A1–B2", time: "Livre", color: "purple" },
  { icon: Headphones, title: "Reunião de trabalho", desc: "Opine, concorde e peça esclarecimentos.", level: "B1", time: "15 min", color: "navy" },
];

function Scenarios({ go }: { go: (id: ScreenId) => void }) {
  return (
    <div className="screen-content">
      <AppHeader title="Escolha uma conversa" subtitle="Pratique situações que fazem parte da sua vida."/>
      <div className="filter-row"><div className="search-box"><Search size={18}/><input placeholder="Buscar cenário..."/></div><div className="filter-pills"><button className="active">Todos</button><button>Cotidiano</button><button>Profissional</button><button>Viagem</button></div></div>
      <div className="featured-scenario">
        <div><span className="eyebrow light">RECOMENDADO PARA VOCÊ</span><h2>Desafio da semana</h2><p>Converse por cinco minutos sem recorrer ao português.</p><div><span><Clock3 size={16}/> 10 min</span><span><Target size={16}/> Fluência</span></div><Button onClick={() => go("conversation")} variant="secondary" icon={<ArrowRight size={17}/>}>Aceitar desafio</Button></div>
        <div className="challenge-art"><div className="speech-orb"><MessageCircle/></div><span>5:00</span></div>
      </div>
      <div className="scenario-grid">
        {scenarioData.map(({ icon: Icon, title, desc, level, time, color }) => (
          <button key={title} className="scenario-card" onClick={() => go("conversation")}>
            <span className={`scenario-art ${color}`}><Icon/></span>
            <div><span className="level-chip">{level}</span><h3>{title}</h3><p>{desc}</p><div className="scenario-meta"><span><Clock3 size={14}/>{time}</span><span>Começar <ArrowRight size={15}/></span></div></div>
          </button>
        ))}
      </div>
    </div>
  );
}

function Conversation({ go }: { go: (id: ScreenId) => void }) {
  return (
    <div className="conversation-screen">
      <header className="conversation-header">
        <button onClick={() => go("scenarios")}><ArrowLeft/></button>
        <div className="conversation-title"><span className="mini-avatar">Lu</span><div><strong>Na cafeteria</strong><small><i/> Lume · A2</small></div></div>
        <div className="session-timer"><Clock3/> 06:42</div>
        <Button variant="ghost" onClick={() => go("summary")}>Encerrar</Button>
      </header>
      <main className="conversation-body">
        <div className="conversation-context"><Coffee/><div><span>SEU OBJETIVO</span><strong>Faça um pedido completo e pergunte o preço.</strong></div><button>Ver dicas</button></div>
        <div className="conversation-messages">
          <div className="time-divider"><span>Hoje, 14:32</span></div>
          <div className="chat-message tutor-message"><div className="mini-avatar">Lu</div><div><span>Good afternoon! Welcome to Sunrise Coffee. What can I get started for you?</span><button><Volume2 size={15}/> Ouvir novamente</button></div></div>
          <div className="chat-message user-message"><div><span>Hi! I want a big cappuccino, please.</span><small>14:33</small></div></div>
          <div className="inline-feedback compact-feedback">
            <div className="feedback-title"><WandSparkles/><strong>Uma forma mais natural</strong><span>Vocabulário</span></div>
            <div className="compare"><del>a big cappuccino</del><ArrowRight size={15}/><ins>a large cappuccino</ins></div>
            <p>Para tamanhos de bebidas, usamos <strong>small, medium</strong> e <strong>large</strong>.</p>
          </div>
          <div className="chat-message tutor-message"><div className="mini-avatar">Lu</div><div><span>Of course! Would you like whole milk or oat milk?</span></div></div>
        </div>
        <div className="conversation-compose">
          <div className="hint-row"><button><Sparkles size={15}/> Preciso de uma dica</button><button><Languages size={15}/> Traduzir pergunta</button></div>
          <div className="compose-box"><button className="mic-button"><Mic2/></button><textarea aria-label="Responder" placeholder="Responda em inglês..."/><button className="send-button"><ArrowRight/></button></div>
          <small>Pressione Enter para enviar · Shift + Enter para nova linha</small>
        </div>
      </main>
      <aside className="conversation-side">
        <div><span className="eyebrow">PROGRESSO DA SESSÃO</span><ProgressRing value={64} label="objetivo"/></div>
        <div className="session-goals"><h3>Nesta conversa</h3><p className="done"><CheckCircle2/> Cumprimentar</p><p className="done"><CheckCircle2/> Fazer o pedido</p><p><i/> Perguntar o preço</p></div>
        <div className="live-words"><h3>Palavras desta conversa</h3><span>whole milk <button>+</button></span><span>oat milk <button>+</button></span><span>large <button>+</button></span></div>
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
          <div className="saved-words"><div className="section-heading compact"><div><span className="eyebrow">VOCABULÁRIO</span><h2>Palavras da sessão</h2></div><button onClick={() => go("vocabulary")}>Ver todas</button></div><div>{["whole milk","oat milk","large","How much is it?"].map((word)=><span key={word}>{word}<button><Volume2 size={14}/></button></span>)}</div></div>
        </main>
        <aside>
          <div className="next-card"><span className="eyebrow">PRÓXIMO PASSO</span><div className="next-icon"><BookOpen/></div><h3>Revise o que aprendeu</h3><p>Uma revisão rápida ajuda a fixar as quatro novas expressões.</p><Button full onClick={() => go("vocabulary")}>Revisar agora</Button><button onClick={() => go("dashboard")}>Voltar ao início</button></div>
        </aside>
      </div>
    </div>
  );
}

function Vocabulary() {
  const [flipped, setFlipped] = useState(false);
  return (
    <div className="screen-content">
      <AppHeader title="Revisão inteligente" subtitle="12 palavras estão prontas para revisar hoje."/>
      <div className="review-header">
        <div><span className="eyebrow">SESSÃO DE HOJE</span><h2>Fortaleça sua memória em 4 minutos</h2><div className="review-progress"><i/><span>1 de 12</span></div></div>
        <div className="memory-count"><Zap/><div><strong>87%</strong><span>retenção estimada</span></div></div>
      </div>
      <div className="flashcard-layout">
        <main>
          <button className={`flashcard${flipped ? " flipped" : ""}`} onClick={() => setFlipped(!flipped)}>
            <span className="card-tag">INGLÊS · CAFETERIA</span>
            {!flipped ? <><small>Como você diria...</small><h2>“Eu gostaria de um café com leite.”</h2><span className="tap-hint"><RotateCcw size={16}/> Toque para revelar</span></> : <><small>Resposta</small><h2>I’d like a coffee with milk.</h2><button className="audio-word"><Volume2/> Ouvir pronúncia</button><p><strong>I’d like</strong> é uma forma educada e natural de fazer pedidos.</p></>}
          </button>
          <div className="review-actions"><span>Quão fácil foi lembrar?</span><div><button>Difícil<small>1 dia</small></button><button>Bom<small>3 dias</small></button><button>Fácil<small>7 dias</small></button></div></div>
        </main>
        <aside className="review-queue"><h3>Fila de hoje</h3><div className="queue-summary"><span><strong>12</strong>novas</span><span><strong>8</strong>revisões</span><span><strong>4 min</strong>estimativa</span></div><div className="queue-list">{["I’d like...","whole milk","large","How much..."].map((word, index)=><div key={word}><span>{index + 1}</span><p><strong>{word}</strong><small>{index === 0 ? "Agora" : `em ${index + 1} cartões`}</small></p></div>)}</div></aside>
      </div>
    </div>
  );
}

function Assessment() {
  return (
    <div className="screen-content assessment-screen">
      <AppHeader title="Descubra seu nível" subtitle="Uma avaliação curta para personalizar seu plano."/>
      <div className="assessment-intro">
        <div className="assessment-copy"><span className="eyebrow light">AVALIAÇÃO OPCIONAL</span><h2>Entenda onde você está — sem pressão.</h2><p>Vamos avaliar compreensão, vocabulário e escrita. O resultado é uma estimativa, não uma certificação.</p><div className="assessment-meta"><span><Clock3/> 8–10 minutos</span><span><Target/> 18 questões</span><span><ShieldCheck/> Resultado privado</span></div><Button variant="secondary">Começar avaliação <ArrowRight size={18}/></Button></div>
        <div className="level-scale"><span>A1<small>Iniciante</small></span><span className="active">A2<small>Básico</small></span><span>B1<small>Intermediário</small></span><span>B2<small>Independente</small></span></div>
      </div>
      <section className="assessment-details"><h2>Como funciona</h2><div><article><span>01</span><BookOpen/><h3>Compreensão</h3><p>Leia situações curtas e escolha a interpretação mais adequada.</p></article><article><span>02</span><Languages/><h3>Uso do idioma</h3><p>Complete frases e mostre como usaria o inglês no cotidiano.</p></article><article><span>03</span><WandSparkles/><h3>Resultado explicado</h3><p>Veja evidências do seu nível e recomendações para avançar.</p></article></div></section>
      <div className="sample-question"><div><span>EXEMPLO DE QUESTÃO</span><strong>Choose the best response:</strong><p>“Would you like anything else?”</p></div><div><button>A. Yes, I like.</button><button className="correct">B. No, that’s all. Thank you. <Check/></button><button>C. I don’t have.</button></div></div>
    </div>
  );
}

function Progress() {
  return (
    <div className="screen-content">
      <AppHeader title="Seu progresso" subtitle="Evidências reais do que você vem construindo."/>
      <div className="period-tabs"><button>7 dias</button><button className="active">30 dias</button><button>3 meses</button><button>Todo período</button></div>
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

function Profile({ go }: { go: (id: ScreenId) => void }) {
  return (
    <div className="screen-content">
      <AppHeader title="Perfil e preferências" subtitle="Ajuste como o Lume ensina você."/>
      <div className="settings-layout">
        <aside className="settings-nav"><button className="active"><CircleUserRound/> Perfil</button><button><Languages/> Idiomas</button><button><Target/> Plano e metas</button><button><Bell/> Notificações</button><button onClick={() => go("privacy")}><ShieldCheck/> Dados e privacidade</button></aside>
        <main className="settings-panel">
          <section><div className="profile-heading"><div className="large-avatar">CA</div><div><h2>Carlos Almeida</h2><p>Aluno desde julho de 2026</p><button>Alterar foto</button></div></div></section>
          <section><h3>Informações pessoais</h3><div className="form-grid"><label>Nome<input defaultValue="Carlos Almeida"/></label><label>Email<input defaultValue="carlos@email.com"/></label></div></section>
          <section><h3>Idioma atual</h3><div className="current-language"><span>🇺🇸</span><div><strong>Inglês</strong><small>Nível A2 · Básico</small></div><button>Trocar idioma</button></div></section>
          <section><h3>Preferências do tutor</h3><label className="setting-row"><div><strong>Correções imediatas</strong><small>Mostrar ajustes logo após cada mensagem.</small></div><input type="checkbox" defaultChecked/></label><label className="setting-row"><div><strong>Explicações progressivas</strong><small>Usar mais inglês conforme você evolui.</small></div><input type="checkbox" defaultChecked/></label></section>
          <div className="save-row"><Button>Salvar alterações</Button></div>
        </main>
      </div>
    </div>
  );
}

function Privacy() {
  return (
    <div className="screen-content">
      <AppHeader title="Dados e privacidade" subtitle="Você controla o que guardamos sobre sua aprendizagem."/>
      <div className="privacy-layout">
        <main>
          <div className="privacy-principle"><ShieldCheck/><div><span className="eyebrow">NOSSO PRINCÍPIO</span><h2>Seus dados existem para ajudar você — e continuam sendo seus.</h2><p>Áudios são apagados após a transcrição. Você pode baixar ou excluir seus dados a qualquer momento.</p></div></div>
          <section className="data-section"><h2>Seus dados</h2><article><span className="data-icon"><MessageCircle/></span><div><strong>Conversas e correções</strong><p>Usadas para manter seu histórico e personalizar atividades.</p><small>18 conversas salvas</small></div><button>Gerenciar</button></article><article><span className="data-icon"><WandSparkles/></span><div><strong>Memórias do tutor</strong><p>Objetivos, preferências e dificuldades que você autorizou.</p><small>8 memórias ativas</small></div><button>Visualizar</button></article><article><span className="data-icon"><Mic2/></span><div><strong>Gravações de voz</strong><p>Processadas para transcrição e excluídas automaticamente.</p><small className="safe"><CheckCircle2/> Nenhum áudio armazenado</small></div></article></section>
          <section className="export-section"><div><Download/><div><h3>Baixe uma cópia dos seus dados</h3><p>Receba um arquivo JSON com perfil, progresso, conversas e vocabulário.</p></div><Button variant="secondary">Solicitar exportação</Button></div></section>
          <section className="danger-zone"><h2>Excluir conta</h2><p>Esta ação remove permanentemente sua conta, progresso, conversas e arquivos associados.</p><Button variant="danger" icon={<Trash2 size={17}/>}>Excluir minha conta</Button></section>
        </main>
        <aside><div className="privacy-summary"><h3>Resumo de privacidade</h3><p><Check/> Áudio apagado após transcrição</p><p><Check/> Dados protegidos por usuário</p><p><Check/> Sem venda de dados pessoais</p><p><Check/> Exportação disponível</p><button>Ver política completa <ArrowRight size={15}/></button></div><div className="session-card"><LockKeyhole/><h3>Sessões ativas</h3><p>Você está conectado neste dispositivo.</p><button>Encerrar outras sessões</button></div></aside>
      </div>
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
    ["plan", "Meu plano", Map],
    ["scenarios", "Conversar", MessageCircle],
    ["vocabulary", "Revisar", BookOpen],
    ["progress", "Progresso", BarChart3],
  ];
  return (
    <>
      <aside className="app-sidebar">
        <Brand/>
        <nav>{navItems.map(([id,label,Icon])=><button key={id} className={current === id ? "active" : ""} onClick={() => go(id)}><Icon/><span>{label}</span>{id === "vocabulary" && <i>12</i>}</button>)}</nav>
        <div className="sidebar-bottom"><button onClick={() => go("profile")}><Settings/><span>Configurações</span></button><div className="mini-profile"><span>{displayName.slice(0, 2).toUpperCase()}</span><div><strong>{displayName}</strong><small>Minha aprendizagem</small></div><button className="signout-button" onClick={signOut} title="Sair"><LogIn/></button></div></div>
      </aside>
      <nav className="mobile-nav">{navItems.slice(0,5).map(([id,label,Icon])=><button key={id} className={current === id ? "active" : ""} onClick={() => go(id)}><Icon/><span>{label === "Meu plano" ? "Plano" : label}</span></button>)}</nav>
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
          <div className="prototype-head"><div><strong>Protótipo navegável</strong><span>16 telas do produto</span></div><button onClick={() => setOpen(false)}><X/></button></div>
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
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      const frame = window.requestAnimationFrame(() => setAuthLoading(false));
      return () => window.cancelAnimationFrame(frame);
    }

    let active = true;
    const initialize = async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;

      const currentSession = data.session;
      setSession(currentSession);
      if (currentSession) {
        setDisplayName(currentSession.user.user_metadata.display_name || currentSession.user.email?.split("@")[0] || "Aluno");
      }

      const fromHash = window.location.hash.replace("#/", "") as ScreenId;
      if (screens.some((item) => item.id === fromHash)) {
        const protectedDestination = appScreens.has(fromHash) || fromHash === "onboarding";
        setScreen(protectedDestination && !currentSession ? "login" : fromHash);
      }
      setAuthLoading(false);
    };

    void initialize();
    const { data: authListener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (nextSession) {
        setDisplayName(nextSession.user.user_metadata.display_name || nextSession.user.email?.split("@")[0] || "Aluno");
      }
      if (event === "PASSWORD_RECOVERY") {
        setPasswordRecovery(true);
        setScreen("recover");
        window.history.replaceState(null, "", "#/recover");
      }
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const navigate = (id: ScreenId) => {
    setScreen(id);
    window.history.replaceState(null, "", `#/${id}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const go = (id: ScreenId) => {
    const destination = (appScreens.has(id) || id === "onboarding") && !session ? "login" : id;
    navigate(destination);
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
      navigate("dashboard");
      return {};
    }

    if (mode === "recover") {
      const { error } = await supabase.auth.resetPasswordForEmail(form.email, {
        redirectTo: `${window.location.origin}/#/login`,
      });
      return error
        ? { error: error.message }
        : { success: "Enviamos o link de recuperação. Verifique sua caixa de entrada." };
    }

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: { display_name: form.name.trim() } },
      });
      if (error) return { error: error.message };
      if (!data.session) {
        return { success: "Conta criada. Confirme seu e-mail para continuar." };
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

    setSession(data.session);
    setDisplayName(data.user.user_metadata.display_name || data.user.email?.split("@")[0] || "Aluno");
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("display_name,onboarding_completed")
      .eq("id", data.user.id)
      .maybeSingle();

    if (profileError) return { error: "Login realizado, mas não foi possível carregar seu perfil." };
    if (profile?.display_name) setDisplayName(profile.display_name);
    navigate(profile?.onboarding_completed ? "dashboard" : "onboarding");
    return {};
  };

  const completeOnboarding = async (data: OnboardingData): Promise<AuthFeedback> => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !session) {
      go("login");
      return { error: "Sua sessão expirou. Entre novamente para continuar." };
    }

    const { error: preferencesError } = await supabase
      .from("learner_preferences")
      .upsert({
        user_id: session.user.id,
        target_language: data.targetLanguage,
        current_level: data.currentLevel,
        learning_goal: data.learningGoal,
        study_minutes_per_day: data.studyMinutesPerDay,
        study_days_per_week: 5,
      });
    if (preferencesError) return { error: "Não foi possível salvar suas preferências. Tente novamente." };

    const { error: profileError } = await supabase
      .from("profiles")
      .upsert({
        id: session.user.id,
        display_name: displayName,
        onboarding_completed: true,
      });
    if (profileError) return { error: "As preferências foram salvas, mas não foi possível concluir o perfil." };

    go("dashboard");
    return {};
  };

  const signOut = async () => {
    const supabase = getSupabaseBrowserClient();
    if (supabase) await supabase.auth.signOut();
    setSession(null);
    go("landing");
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
      case "onboarding": return <Onboarding complete={completeOnboarding}/>;
      case "dashboard": return <Dashboard go={go} displayName={displayName}/>;
      case "plan": return <Plan go={go}/>;
      case "scenarios": return <Scenarios go={go}/>;
      case "conversation": return <Conversation go={go}/>;
      case "summary": return <Summary go={go}/>;
      case "vocabulary": return <Vocabulary/>;
      case "assessment": return <Assessment/>;
      case "progress": return <Progress/>;
      case "profile": return <Profile go={go}/>;
      case "privacy": return <Privacy/>;
    }
  })();

  return (
    <div className={appScreens.has(screen) ? "app-shell" : "public-page"}>
      {appScreens.has(screen) && screen !== "conversation" && <AppNav current={screen} go={go} displayName={displayName} signOut={signOut}/>}
      <div className={appScreens.has(screen) && screen !== "conversation" ? "app-main" : "full-main"}>{content}</div>
      <PrototypeNavigator current={screen} go={go}/>
    </div>
  );
}
