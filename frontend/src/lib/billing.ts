import { apiRequest } from "@/lib/api-client";

export type BillingCycle = "monthly" | "annual";

export type CheckoutResponse = {
  checkout_url: string;
  external_subscription_id: string;
};

export type BillingSubscription = {
  plan_id: string;
  subscription_status: string;
  subscription_ends_at: string | null;
  billing_cycle: BillingCycle | null;
  subscription_source: string;
  can_manage_billing: boolean;
  manage_url: string | null;
};

export async function startCheckout(accessToken: string, billingCycle: BillingCycle) {
  return apiRequest<CheckoutResponse>("/api/v1/billing/checkout", {
    accessToken,
    method: "POST",
    body: { billing_cycle: billingCycle },
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
