import { apiRequest } from "@/lib/api-client";

export type UsageCounter = {
  used: number;
  limit: number;
};

export type EntitlementsSummary = {
  plan_id: string;
  account_status: string;
  max_learner_messages_per_session: number;
  usage: {
    conversation_sessions: UsageCounter;
    llm_requests: UsageCounter;
    llm_cost_usd: UsageCounter;
    transcriptions: UsageCounter;
  };
};

export function planLabel(planId: string) {
  return planId === "premium" ? "Premium" : "Free";
}

export async function loadEntitlements(accessToken: string) {
  return apiRequest<EntitlementsSummary>("/api/v1/account/entitlements", { accessToken });
}
