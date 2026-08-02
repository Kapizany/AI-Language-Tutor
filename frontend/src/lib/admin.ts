import { apiRequest } from "@/lib/api-client";

export type AdminOverview = {
  users_total: number;
  users_new: number;
  onboarding_completed: number;
  dau: number;
  wau: number;
  mau: number;
  conversation_sessions: number;
  conversation_messages: number;
  llm_cost_usd: number;
  llm_requests: number;
  plan_distribution: Record<string, number>;
  language_distribution: Record<string, number>;
  level_distribution: Record<string, number>;
};

export type AdminUserListItem = {
  user_id: string;
  email_masked: string;
  display_name: string;
  account_status: string;
  onboarding_completed: boolean;
  plan_id: string;
  created_at: string;
};

export type AdminUserSummary = {
  user_id: string;
  email_masked: string;
  display_name: string;
  account_status: string;
  suspended_at: string | null;
  suspended_reason: string | null;
  onboarding_completed: boolean;
  plan_id: string;
  subscription_status: string;
  created_at: string;
  target_language: string | null;
  current_level: string | null;
  conversation_sessions: number;
  conversation_completed: number;
  llm_cost_usd: number;
};

export type AdminFeatureUsage = {
  feature: string;
  requests: number;
  cost_usd: number;
  avg_latency_ms: number;
  input_tokens: number;
  output_tokens: number;
};

export type AdminAuditLogEntry = {
  id: number;
  actor_user_id: string | null;
  action: string;
  target_type: string;
  target_id: string;
  previous_state: Record<string, unknown>;
  new_state: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
};

export async function verifyAdminAccess(accessToken: string) {
  return apiRequest<{ id: string; email: string | null }>("/api/v1/admin/me", { accessToken });
}

export async function loadAdminOverview(accessToken: string) {
  return apiRequest<AdminOverview>("/api/v1/admin/overview", { accessToken });
}

export async function searchAdminUsers(accessToken: string, query: string) {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());
  return apiRequest<AdminUserListItem[]>(`/api/v1/admin/users?${params.toString()}`, {
    accessToken,
  });
}

export async function loadAdminUser(accessToken: string, userId: string) {
  return apiRequest<AdminUserSummary>(`/api/v1/admin/users/${userId}`, { accessToken });
}

export async function changeAdminUserPlan(
  accessToken: string,
  userId: string,
  planId: "free" | "premium",
) {
  return apiRequest<{ updated: boolean; plan_id: string }>(
    `/api/v1/admin/users/${userId}/plan`,
    { accessToken, method: "PATCH", body: { plan_id: planId } },
  );
}

export async function changeAdminUserStatus(
  accessToken: string,
  userId: string,
  status: "active" | "suspended",
  reason?: string,
) {
  return apiRequest<{ updated: boolean; account_status: string }>(
    `/api/v1/admin/users/${userId}/status`,
    { accessToken, method: "PATCH", body: { status, reason } },
  );
}

export async function loadAdminFeatures(accessToken: string) {
  return apiRequest<AdminFeatureUsage[]>("/api/v1/admin/features", { accessToken });
}

export async function loadAdminAudit(accessToken: string) {
  return apiRequest<AdminAuditLogEntry[]>("/api/v1/admin/audit", { accessToken });
}
