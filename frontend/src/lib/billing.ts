import { apiRequest } from "@/lib/api-client";

export type BillingCycle = "monthly" | "annual";

export type CheckoutSession = {
  public_key: string;
  amount: number;
  currency: string;
  billing_cycle: BillingCycle;
  reason: string;
  payer_email: string | null;
  mock_checkout: boolean;
};

export type SubscribeResponse = {
  plan_id: string;
  subscription_status: string;
  external_subscription_id: string;
  billing_cycle: BillingCycle;
};

export type BillingSubscription = {
  plan_id: string;
  subscription_status: string;
  subscription_started_at: string | null;
  subscription_ends_at: string | null;
  subscription_renews_at: string | null;
  billing_cycle: BillingCycle | null;
  subscription_source: string;
  can_manage_billing: boolean;
  manage_url: string | null;
};

export async function createCheckoutSession(
  accessToken: string,
  billingCycle: BillingCycle,
) {
  return apiRequest<CheckoutSession>("/api/v1/billing/checkout/session", {
    accessToken,
    method: "POST",
    body: { billing_cycle: billingCycle },
  });
}

export async function subscribeWithCardToken(
  accessToken: string,
  billingCycle: BillingCycle,
  cardTokenId: string,
  payerEmail?: string | null,
) {
  return apiRequest<SubscribeResponse>("/api/v1/billing/subscribe", {
    accessToken,
    method: "POST",
    body: {
      billing_cycle: billingCycle,
      card_token_id: cardTokenId,
      ...(payerEmail ? { payer_email: payerEmail } : {}),
    },
  });
}

export async function refreshBillingSubscription(accessToken: string) {
  return apiRequest<{
    updated: boolean;
    plan_id?: string;
    subscription_status?: string;
    reason?: string;
  }>("/api/v1/billing/refresh", {
    accessToken,
    method: "POST",
  });
}

export async function loadBillingSubscription(accessToken: string) {
  return apiRequest<BillingSubscription>("/api/v1/billing/subscription", { accessToken });
}

export async function cancelBillingSubscription(accessToken: string) {
  return apiRequest<{
    subscription_status: string;
    subscription_ends_at: string | null;
    external_subscription_id: string;
  }>("/api/v1/billing/subscription/cancel", {
    accessToken,
    method: "POST",
  });
}
