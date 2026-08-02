from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class UsageCounter(BaseModel):
    used: int | float
    limit: int | float


class EntitlementsSummary(BaseModel):
    found: bool = True
    plan_id: str
    account_status: str
    max_learner_messages_per_session: int
    usage: dict[str, UsageCounter]


class AdminOverview(BaseModel):
    users_total: int = 0
    users_new: int = 0
    onboarding_completed: int = 0
    dau: int = 0
    wau: int = 0
    mau: int = 0
    conversation_sessions: int = 0
    conversation_messages: int = 0
    llm_cost_usd: float = 0
    llm_requests: int = 0
    plan_distribution: dict[str, int] = Field(default_factory=dict)
    language_distribution: dict[str, int] = Field(default_factory=dict)
    level_distribution: dict[str, int] = Field(default_factory=dict)


class AdminUserListItem(BaseModel):
    user_id: UUID
    email_masked: str
    display_name: str
    account_status: str
    onboarding_completed: bool
    plan_id: str
    created_at: datetime


class AdminUserSummary(BaseModel):
    found: bool = True
    user_id: UUID | None = None
    email_masked: str | None = None
    display_name: str | None = None
    account_status: str | None = None
    suspended_at: datetime | None = None
    suspended_reason: str | None = None
    onboarding_completed: bool | None = None
    plan_id: str | None = None
    subscription_status: str | None = None
    is_admin: bool = False
    created_at: datetime | None = None
    target_language: str | None = None
    current_level: str | None = None
    conversation_sessions: int = 0
    conversation_completed: int = 0
    llm_cost_usd: float = 0
    entitlements: EntitlementsSummary | dict[str, Any] | None = None


class AdminAuditLogEntry(BaseModel):
    id: int
    actor_user_id: UUID | None
    action: str
    target_type: str
    target_id: str
    previous_state: dict[str, Any]
    new_state: dict[str, Any]
    metadata: dict[str, Any]
    created_at: datetime


class AdminFeatureUsage(BaseModel):
    feature: str
    requests: int
    cost_usd: float
    avg_latency_ms: float
    input_tokens: int
    output_tokens: int


class ChangePlanRequest(BaseModel):
    plan_id: str = Field(pattern="^(free|premium)$")


class SetAccountStatusRequest(BaseModel):
    status: str = Field(pattern="^(active|suspended)$")
    reason: str | None = Field(default=None, max_length=500)


class SetUserAdminRoleRequest(BaseModel):
    is_admin: bool
