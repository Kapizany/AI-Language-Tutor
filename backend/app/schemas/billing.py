from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

BillingCycle = Literal["monthly", "annual"]


class CheckoutSessionRequest(BaseModel):
    billing_cycle: BillingCycle


class CheckoutSessionResponse(BaseModel):
    public_key: str
    amount: float
    currency: str = "BRL"
    billing_cycle: BillingCycle
    reason: str
    payer_email: str | None = None
    mock_checkout: bool = False


class SubscribeRequest(BaseModel):
    billing_cycle: BillingCycle
    card_token_id: str = Field(min_length=8, max_length=200)


class SubscribeResponse(BaseModel):
    plan_id: str
    subscription_status: str
    external_subscription_id: str
    billing_cycle: BillingCycle


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
    can_manage_billing: bool = False
    manage_url: str | None = None


class BillingRefreshResponse(BaseModel):
    updated: bool
    plan_id: str | None = None
    subscription_status: str | None = None
    reason: str | None = None
