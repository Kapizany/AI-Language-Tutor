import { apiRequest } from "@/lib/api-client";

export type BillingCycle = "monthly" | "annual";
export type PaymentMethod = "card" | "pix_automatic";

export type CheckoutSubscribePayload = {
  billing_cycle: BillingCycle;
  payment_method: PaymentMethod;
  cpf: string;
  card_holder_name?: string;
  card_number?: string;
  card_expiry_month?: string;
  card_expiry_year?: string;
  card_cvv?: string;
  holder_postal_code?: string;
  holder_address_number?: string;
  holder_phone?: string;
};

export type CheckoutSubscribeResponse = {
  status: "pending" | "confirmed";
  payment_method: PaymentMethod;
  external_subscription_id: string;
  amount: number;
  currency: string;
  billing_cycle: BillingCycle;
  message: string;
  pix_qr_code?: string | null;
  pix_copy_paste?: string | null;
  mock_checkout: boolean;
};

export type CheckoutStatus = {
  has_pending_checkout: boolean;
  checkout_status?: "pending" | "authorized" | "cancelled" | "failed" | null;
  payment_status?: "pending" | "confirmed" | "overdue" | "canceled" | "processing" | null;
  payment_method?: PaymentMethod | null;
  billing_cycle?: BillingCycle | null;
  amount?: number | null;
  currency?: string;
  external_subscription_id?: string | null;
  pix_qr_code?: string | null;
  pix_copy_paste?: string | null;
  checkout_created_at?: string | null;
  message?: string | null;
};

export type BillingSubscription = {
  plan_id: string;
  subscription_status: string;
  subscription_started_at: string | null;
  subscription_ends_at: string | null;
  subscription_renews_at: string | null;
  billing_cycle: BillingCycle | null;
  subscription_source: string;
  payment_method: string | null;
  can_manage_billing: boolean;
  manage_url: string | null;
};

export type BillingCheckoutHistoryItem = {
  id?: number | null;
  billing_cycle?: BillingCycle | null;
  payment_method?: string | null;
  status?: string | null;
  external_subscription_id?: string | null;
  amount?: number | null;
  currency?: string;
  created_at?: string | null;
  updated_at?: string | null;
  can_resume?: boolean;
  can_retry?: boolean;
};

export type BillingEventHistoryItem = {
  id?: number | null;
  event_type?: string | null;
  event_key?: string | null;
  processed_at?: string | null;
  payment_status?: string | null;
};

export type BillingHistorySubscription = {
  plan_id?: string | null;
  status?: string | null;
  started_at?: string | null;
  ends_at?: string | null;
  renews_at?: string | null;
  billing_cycle?: BillingCycle | null;
  subscription_source?: string | null;
  payment_method?: string | null;
  external_subscription_id?: string | null;
};

export type BillingHistory = {
  subscription: BillingHistorySubscription | null;
  checkouts: BillingCheckoutHistoryItem[];
  events: BillingEventHistoryItem[];
  pending_checkout?: BillingCheckoutHistoryItem | null;
};

export async function subscribeCheckout(
  accessToken: string,
  payload: CheckoutSubscribePayload,
) {
  return apiRequest<CheckoutSubscribeResponse>("/api/v1/billing/checkout/subscribe", {
    accessToken,
    method: "POST",
    body: payload,
  });
}

export async function loadCheckoutStatus(accessToken: string) {
  return apiRequest<CheckoutStatus>("/api/v1/billing/checkout/status", { accessToken });
}

export async function resumePendingCheckout(
  accessToken: string,
  externalSubscriptionId: string,
) {
  return apiRequest<CheckoutStatus>("/api/v1/billing/checkout/resume", {
    accessToken,
    method: "POST",
    body: { external_subscription_id: externalSubscriptionId },
  });
}

export async function abandonPendingCheckout(
  accessToken: string,
  externalSubscriptionId?: string | null,
) {
  return apiRequest<CheckoutStatus>("/api/v1/billing/checkout/abandon", {
    accessToken,
    method: "POST",
    body: {
      external_subscription_id: externalSubscriptionId || undefined,
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

export async function loadBillingHistory(accessToken: string) {
  return apiRequest<BillingHistory>("/api/v1/billing/history", { accessToken });
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
