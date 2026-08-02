"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  ShieldAlert,
  ShieldCheck,
  Users,
} from "lucide-react";

import {
  changeAdminUserPlan,
  changeAdminUserRole,
  changeAdminUserStatus,
  loadAdminAudit,
  loadAdminFeatures,
  loadAdminOverview,
  loadAdminUser,
  searchAdminUsers,
  verifyAdminAccess,
  type AdminAuditLogEntry,
  type AdminFeatureUsage,
  type AdminOverview,
  type AdminUserListItem,
  type AdminUserSummary,
} from "@/lib/admin";
import { ApiClientError } from "@/lib/api-client";
import type { ScreenId } from "@/lib/learner";
import { planLabel } from "@/lib/entitlements";

type AdminTab = "overview" | "users" | "features" | "audit";

type AdminPanelProps = {
  session: Session;
  go: (id: ScreenId) => void;
};

const subscriptionStatusLabel = (status: string) => {
  if (status === "active") return "Ativa";
  if (status === "trialing") return "Em teste";
  if (status === "canceled") return "Cancelada";
  if (status === "suspended") return "Suspensa";
  return status;
};

const billingCycleLabel = (cycle: "monthly" | "annual" | null) => {
  if (cycle === "monthly") return "Mensal";
  if (cycle === "annual") return "Anual";
  return "Sem ciclo";
};

const subscriptionDateLabel = (value: string | null, fallback: string) =>
  value
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(value))
    : fallback;

function StatCard({
  label,
  value,
  icon: Icon,
  tone = "teal",
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ size?: number }>;
  tone?: "teal" | "coral" | "blue" | "amber";
}) {
  return (
    <article className={`stat stat-${tone}`}>
      <div className="stat-icon"><Icon size={18} /></div>
      <div><strong>{value}</strong><span>{label}</span></div>
    </article>
  );
}

function DistributionList({
  title,
  data,
}: {
  title: string;
  data: Record<string, number>;
}) {
  const entries = Object.entries(data);
  return (
    <section className="chart-card">
      <h3>{title}</h3>
      {entries.length === 0 ? <p className="admin-empty">Sem dados ainda.</p> : (
        <ul className="admin-distribution">
          {entries.map(([key, total]) => (
            <li key={key}><span>{key}</span><strong>{total}</strong></li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function AdminPanel({ session, go }: AdminPanelProps) {
  const [tab, setTab] = useState<AdminTab>("overview");
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState("");
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [features, setFeatures] = useState<AdminFeatureUsage[]>([]);
  const [audit, setAudit] = useState<AdminAuditLogEntry[]>([]);
  const [query, setQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUserSummary | null>(null);
  const [actionMessage, setActionMessage] = useState("");

  const accessToken = session.access_token;

  const loadTab = useCallback(async (nextTab: AdminTab) => {
    setError("");
    setLoading(true);
    try {
      if (nextTab === "overview") {
        setOverview(await loadAdminOverview(accessToken));
      } else if (nextTab === "users") {
        setUsers(await searchAdminUsers(accessToken, query));
      } else if (nextTab === "features") {
        setFeatures(await loadAdminFeatures(accessToken));
      } else {
        setAudit(await loadAdminAudit(accessToken));
      }
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        setError(caught.message);
      } else {
        setError("Não foi possível carregar o painel administrativo.");
      }
    } finally {
      setLoading(false);
    }
  }, [accessToken, query]);

  useEffect(() => {
    let active = true;
    const bootstrap = async () => {
      setLoading(true);
      setDenied(false);
      setError("");
      try {
        await verifyAdminAccess(accessToken);
        if (!active) return;
        setOverview(await loadAdminOverview(accessToken));
      } catch (caught) {
        if (!active) return;
        if (caught instanceof ApiClientError && caught.status === 403) {
          setDenied(true);
        } else if (caught instanceof ApiClientError) {
          setError(caught.message);
        } else {
          setError("Não foi possível verificar o acesso administrativo.");
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void bootstrap();
    return () => { active = false; };
  }, [accessToken]);

  const changeTab = (nextTab: AdminTab) => {
    setTab(nextTab);
    if (nextTab === "overview" && overview) return;
    void loadTab(nextTab);
  };

  const openUser = async (userId: string) => {
    setSelectedUserId(userId);
    setActionMessage("");
    setError("");
    try {
      setSelectedUser(await loadAdminUser(accessToken, userId));
    } catch (caught) {
      setSelectedUser(null);
      setError(caught instanceof ApiClientError ? caught.message : "Usuário indisponível.");
    }
  };

  const applyPlan = async (planId: "free" | "premium") => {
    if (!selectedUserId || selectedUser?.plan_id === planId) return;
    setActionMessage("");
    try {
      await changeAdminUserPlan(accessToken, selectedUserId, planId);
      setActionMessage(`Plano alterado para ${planLabel(planId)}.`);
      await openUser(selectedUserId);
      if (tab === "users") setUsers(await searchAdminUsers(accessToken, query));
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "Falha ao alterar plano.");
    }
  };

  const applyAdminRole = async (isAdmin: boolean) => {
    if (!selectedUserId || selectedUser?.is_admin === isAdmin) return;
    setActionMessage("");
    try {
      await changeAdminUserRole(accessToken, selectedUserId, isAdmin);
      setActionMessage(isAdmin ? "Usuário promovido a administrador." : "Privilégios de admin removidos.");
      await openUser(selectedUserId);
    } catch (caught) {
      const message = caught instanceof ApiClientError ? caught.message : "Falha ao alterar privilégios.";
      if (message.includes("cannot_revoke_self")) {
        setError("Você não pode remover seu próprio acesso de administrador.");
      } else if (message.includes("last_admin")) {
        setError("Não é possível remover o último administrador do sistema.");
      } else {
        setError(message);
      }
    }
  };

  const applyStatus = async (status: "active" | "suspended") => {
    if (!selectedUserId) return;
    setActionMessage("");
    try {
      await changeAdminUserStatus(
        accessToken,
        selectedUserId,
        status,
        status === "suspended" ? "Suspensão administrativa" : undefined,
      );
      setActionMessage(status === "suspended" ? "Conta suspensa." : "Conta reativada.");
      await openUser(selectedUserId);
      if (tab === "users") setUsers(await searchAdminUsers(accessToken, query));
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "Falha ao alterar status.");
    }
  };

  if (loading && !overview && !denied && !error) {
    return <div className="admin-shell"><div className="app-loading"><ShieldCheck /><span>Carregando painel...</span></div></div>;
  }

  if (denied) {
    return (
      <div className="admin-shell">
        <div className="admin-denied" role="alert">
          <ShieldAlert size={28} />
          <h1>Acesso negado</h1>
          <p>Esta área é restrita a administradores autorizados.</p>
          <button type="button" onClick={() => go("dashboard")}>Voltar ao início</button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <button type="button" className="admin-back" onClick={() => go("dashboard")}>
          <ArrowLeft size={16} /> Voltar
        </button>
        <div>
          <span className="eyebrow">Operação interna</span>
          <h1>Painel administrativo</h1>
        </div>
      </header>

      <nav className="admin-tabs" aria-label="Seções administrativas">
        <button type="button" className={tab === "overview" ? "active" : ""} onClick={() => changeTab("overview")}><BarChart3 size={16}/> Visão geral</button>
        <button type="button" className={tab === "users" ? "active" : ""} onClick={() => changeTab("users")}><Users size={16}/> Usuários</button>
        <button type="button" className={tab === "features" ? "active" : ""} onClick={() => changeTab("features")}><Activity size={16}/> Features</button>
        <button type="button" className={tab === "audit" ? "active" : ""} onClick={() => changeTab("audit")}><ShieldCheck size={16}/> Auditoria</button>
      </nav>

      {error && <div className="form-message form-error" role="alert">{error}</div>}
      {actionMessage && <div className="form-message form-success" role="status">{actionMessage}</div>}

      {tab === "overview" && overview && (
        <>
          <div className="stats-grid">
            <StatCard label="Usuários totais" value={overview.users_total} icon={Users} />
            <StatCard label="Novos (30 dias)" value={overview.users_new} icon={Users} tone="blue" />
            <StatCard label="DAU" value={overview.dau} icon={Activity} tone="coral" />
            <StatCard label="MAU" value={overview.mau} icon={Activity} tone="amber" />
            <StatCard label="Sessões de conversa" value={overview.conversation_sessions} icon={BarChart3} />
            <StatCard label="Mensagens" value={overview.conversation_messages} icon={BarChart3} tone="blue" />
            <StatCard label="Requisições LLM" value={overview.llm_requests} icon={Activity} />
            <StatCard label="Custo LLM (USD)" value={overview.llm_cost_usd.toFixed(2)} icon={BarChart3} tone="coral" />
          </div>
          <div className="analytics-grid">
            <DistributionList title="Distribuição por plano" data={overview.plan_distribution} />
            <DistributionList title="Idiomas de estudo" data={overview.language_distribution} />
          </div>
          <div className="analytics-grid">
            <DistributionList title="Níveis declarados" data={overview.level_distribution} />
            <section className="chart-card">
              <h3>Onboarding</h3>
              <p><strong>{overview.onboarding_completed}</strong> perfis concluíram o onboarding.</p>
              <p className="admin-note">WAU: {overview.wau} usuários ativos nos últimos 7 dias.</p>
            </section>
          </div>
        </>
      )}

      {tab === "users" && (
        <div className="admin-users-layout">
          <section className="chart-card">
            <div className="admin-search-row">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por email, nome ou UUID"
                aria-label="Buscar usuários"
              />
              <button type="button" onClick={() => void loadTab("users")}>Buscar</button>
            </div>
            {loading ? <p>Carregando usuários...</p> : users.length === 0 ? (
              <p className="admin-empty">Nenhum usuário encontrado.</p>
            ) : (
              <ul className="admin-user-list">
                {users.map((user) => (
                  <li key={user.user_id}>
                    <button type="button" onClick={() => void openUser(user.user_id)}>
                      <strong>{user.display_name || "Sem nome"}</strong>
                      <span>{user.email_masked}</span>
                      <small>
                        {planLabel(user.plan_id)} · {billingCycleLabel(user.billing_cycle)}
                        {" · "}{subscriptionStatusLabel(user.subscription_status)}
                      </small>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <aside className="chart-card admin-user-detail">
            {!selectedUser ? (
              <p className="admin-empty">Selecione um usuário para ver consumo e ações auditadas.</p>
            ) : (
              <>
                <h3>{selectedUser.display_name || "Usuário"}</h3>
                <p>{selectedUser.email_masked}</p>
                <ul className="admin-meta">
                  <li><span>Plano</span><strong>{planLabel(selectedUser.plan_id)}</strong></li>
                  <li>
                    <span>Ciclo</span>
                    <strong>{billingCycleLabel(selectedUser.billing_cycle)}</strong>
                  </li>
                  <li>
                    <span>Assinatura</span>
                    <strong>{subscriptionStatusLabel(selectedUser.subscription_status)}</strong>
                  </li>
                  <li>
                    <span>Início</span>
                    <strong>
                      {subscriptionDateLabel(
                        selectedUser.subscription_started_at,
                        "Sem data informada",
                      )}
                    </strong>
                  </li>
                  <li>
                    <span>Próxima renovação</span>
                    <strong>
                      {subscriptionDateLabel(
                        selectedUser.subscription_renews_at,
                        "Não agendada",
                      )}
                    </strong>
                  </li>
                  <li>
                    <span>Término</span>
                    <strong>
                      {subscriptionDateLabel(
                        selectedUser.subscription_ends_at,
                        selectedUser.subscription_status === "active"
                          ? "Sem término"
                          : "Sem data informada",
                      )}
                    </strong>
                  </li>
                  <li>
                    <span>Origem</span>
                    <strong>
                      {selectedUser.subscription_source === "mercadopago"
                        ? "Mercado Pago"
                        : selectedUser.subscription_source === "admin"
                          ? "Administrador"
                          : "Sistema"}
                    </strong>
                  </li>
                  <li><span>Status</span><strong>{selectedUser.account_status}</strong></li>
                  <li><span>Admin</span><strong>{selectedUser.is_admin ? "Sim" : "Não"}</strong></li>
                  <li><span>Conversas</span><strong>{selectedUser.conversation_sessions}</strong></li>
                  <li><span>Concluídas</span><strong>{selectedUser.conversation_completed}</strong></li>
                  <li><span>Custo LLM</span><strong>${selectedUser.llm_cost_usd.toFixed(2)}</strong></li>
                </ul>
                <div className="admin-actions">
                  <div className="admin-action-group">
                    <span className="admin-action-label">Plano</span>
                    <div className="admin-action-row">
                      <button
                        type="button"
                        className={selectedUser.plan_id === "free" ? "active" : ""}
                        onClick={() => void applyPlan("free")}
                      >
                        Free
                      </button>
                      <button
                        type="button"
                        className={selectedUser.plan_id === "premium" ? "active" : ""}
                        onClick={() => void applyPlan("premium")}
                      >
                        Premium
                      </button>
                    </div>
                  </div>
                  <div className="admin-action-group">
                    <span className="admin-action-label">Privilégios</span>
                    <div className="admin-action-row">
                      {selectedUser.is_admin ? (
                        <button type="button" className="danger" onClick={() => void applyAdminRole(false)}>
                          Remover admin
                        </button>
                      ) : (
                        <button type="button" onClick={() => void applyAdminRole(true)}>
                          Tornar admin
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="admin-action-group">
                    <span className="admin-action-label">Conta</span>
                    <div className="admin-action-row">
                      {selectedUser.account_status === "active" ? (
                        <button type="button" className="danger" onClick={() => void applyStatus("suspended")}>
                          Suspender
                        </button>
                      ) : (
                        <button type="button" onClick={() => void applyStatus("active")}>Reativar</button>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </aside>
        </div>
      )}

      {tab === "features" && (
        <section className="chart-card">
          {loading ? <p>Carregando consumo...</p> : features.length === 0 ? (
            <p className="admin-empty">Nenhum uso de LLM registrado ainda.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>Requisições</th>
                  <th>Custo USD</th>
                  <th>Latência média</th>
                  <th>Tokens</th>
                </tr>
              </thead>
              <tbody>
                {features.map((row) => (
                  <tr key={row.feature}>
                    <td>{row.feature}</td>
                    <td>{row.requests}</td>
                    <td>{row.cost_usd.toFixed(4)}</td>
                    <td>{Math.round(row.avg_latency_ms)} ms</td>
                    <td>{row.input_tokens + row.output_tokens}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {tab === "audit" && (
        <section className="chart-card">
          {loading ? <p>Carregando auditoria...</p> : audit.length === 0 ? (
            <p className="admin-empty">Nenhuma mutação administrativa registrada.</p>
          ) : (
            <ul className="admin-audit-list">
              {audit.map((entry) => (
                <li key={entry.id}>
                  <strong>{entry.action}</strong>
                  <span>{entry.target_type} · {entry.target_id}</span>
                  <small>{new Date(entry.created_at).toLocaleString("pt-BR")}</small>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
