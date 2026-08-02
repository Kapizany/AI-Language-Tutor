from datetime import datetime
from typing import Literal

from pydantic import BaseModel

BillingCycle = Literal["monthly", "annual"]


class CheckoutRequest(BaseModel):
    billing_cycle: BillingCycle


class CheckoutResponse(BaseModel):
    checkout_url: str
    external_subscription_id: str


class BillingSubscriptionView(BaseModel):
    plan_id: str
    subscription_status: str
    subscription_ends_at: datetime | None = None
    billing_cycle: str | None = None
    subscription_source: str = "system"
    can_manage_billing: bool = False
    manage_url: str | None = None


class BillingRefreshResponse(BaseModel):
    updated: bool
    plan_id: str | None = None
    subscription_status: str | None = None
    reason: str | None = None
