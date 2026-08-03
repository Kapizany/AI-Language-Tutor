from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

BillingCycle = Literal["monthly", "annual"]
PaymentMethod = Literal["card", "pix_automatic"]


class CheckoutSubscribeRequest(BaseModel):
    billing_cycle: BillingCycle
    payment_method: PaymentMethod
    cpf: str = Field(min_length=11, max_length=14)
    card_holder_name: str | None = Field(default=None, max_length=120)
    card_number: str | None = Field(default=None, max_length=19)
    card_expiry_month: str | None = Field(default=None, max_length=2)
    card_expiry_year: str | None = Field(default=None, max_length=4)
    card_cvv: str | None = Field(default=None, max_length=4)
    holder_postal_code: str | None = Field(default=None, max_length=9)
    holder_address_number: str | None = Field(default=None, max_length=20)
    holder_phone: str | None = Field(default=None, max_length=20)


class CheckoutSubscribeResponse(BaseModel):
    status: Literal["pending", "confirmed"]
    payment_method: PaymentMethod
    external_subscription_id: str
    amount: float
    currency: str = "BRL"
    billing_cycle: BillingCycle
    message: str
    pix_qr_code: str | None = None
    pix_copy_paste: str | None = None
    mock_checkout: bool = False


class CancelSubscriptionResponse(BaseModel):
    subscription_status: str
    subscription_ends_at: datetime | None = None
    external_subscription_id: str


class BillingSubscriptionView(BaseModel):
    plan_id: str
    subscription_status: str
    subscription_started_at: datetime | None = None
    subscription_ends_at: datetime | None = None
    subscription_renews_at: datetime | None = None
    billing_cycle: str | None = None
    subscription_source: str = "system"
    payment_method: str | None = None
    can_manage_billing: bool = False
    manage_url: str | None = None


class BillingRefreshResponse(BaseModel):
    updated: bool
    plan_id: str | None = None
    subscription_status: str | None = None
    reason: str | None = None


class CheckoutStatusResponse(BaseModel):
    has_pending_checkout: bool
    checkout_status: Literal["pending", "authorized", "cancelled", "failed"] | None = None
    payment_status: Literal["pending", "confirmed", "overdue", "canceled", "processing"] | None = (
        None
    )
    payment_method: PaymentMethod | None = None
    billing_cycle: BillingCycle | None = None
    amount: float | None = None
    currency: str = "BRL"
    external_subscription_id: str | None = None
    pix_qr_code: str | None = None
    pix_copy_paste: str | None = None
    checkout_created_at: datetime | None = None
    message: str | None = None


class BillingCheckoutHistoryItem(BaseModel):
    id: int | None = None
    billing_cycle: BillingCycle | None = None
    payment_method: str | None = None
    status: str | None = None
    external_subscription_id: str | None = None
    amount: float | None = None
    currency: str = "BRL"
    created_at: datetime | None = None
    updated_at: datetime | None = None
    can_resume: bool = False
    can_retry: bool = False


class ResumeCheckoutRequest(BaseModel):
    external_subscription_id: str = Field(min_length=1, max_length=120)


class AbandonCheckoutRequest(BaseModel):
    external_subscription_id: str | None = Field(default=None, max_length=120)


class BillingEventHistoryItem(BaseModel):
    id: int | None = None
    event_type: str | None = None
    event_key: str | None = None
    processed_at: datetime | None = None
    payment_status: str | None = None


class BillingHistoryResponse(BaseModel):
    subscription: dict[str, Any] | None = None
    checkouts: list[BillingCheckoutHistoryItem] = Field(default_factory=list)
    events: list[BillingEventHistoryItem] = Field(default_factory=list)
    pending_checkout: BillingCheckoutHistoryItem | None = None
