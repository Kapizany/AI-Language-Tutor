from unittest.mock import AsyncMock
from uuid import UUID

import httpx
import pytest

from app.api.dependencies import get_admin_service, get_entitlement_service
from app.core.security import get_current_user
from app.main import app
from app.schemas.auth import AuthenticatedUser
from app.services.admin import AdminService
from app.services.entitlements import EntitlementService
from tests.support import LEARNER_ID

ADMIN_ID = UUID("20000000-0000-0000-0000-000000000002")


async def learner_user() -> AuthenticatedUser:
    return AuthenticatedUser(id=LEARNER_ID, email="learner@example.test")


async def admin_user() -> AuthenticatedUser:
    return AuthenticatedUser(id=ADMIN_ID, email="admin@example.test")


class AdminHarness:
    def __init__(self, *, is_admin: bool) -> None:
        self.is_admin = is_admin
        self.entitlements = AsyncMock(spec=EntitlementService)
        self.entitlements.is_admin.return_value = is_admin
        self.admin = AsyncMock(spec=AdminService)
        self.admin.get_overview.return_value = {
            "users_total": 10,
            "users_new": 2,
            "onboarding_completed": 8,
            "dau": 3,
            "wau": 6,
            "mau": 9,
            "conversation_sessions": 12,
            "conversation_messages": 40,
            "llm_cost_usd": 1.25,
            "llm_requests": 55,
            "plan_distribution": {"free": 8, "premium": 2},
            "language_distribution": {"en": 7, "es": 3},
            "level_distribution": {"A1": 2, "A2": 5, "B1": 3},
        }

    async def __aenter__(self) -> "AdminHarness":
        async def configured_entitlements() -> EntitlementService:
            return self.entitlements

        async def configured_admin() -> AdminService:
            return self.admin

        app.dependency_overrides[get_current_user] = admin_user if self.is_admin else learner_user
        app.dependency_overrides[get_entitlement_service] = configured_entitlements
        app.dependency_overrides[get_admin_service] = configured_admin
        self.client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
            headers={"Authorization": "Bearer token"},
        )
        await self.client.__aenter__()
        return self

    async def __aexit__(self, *exc_info: object) -> None:
        await self.client.__aexit__(None, None, None)
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_non_admin_cannot_access_overview() -> None:
    async with AdminHarness(is_admin=False) as harness:
        response = await harness.client.get("/api/v1/admin/overview")
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_admin_can_access_overview() -> None:
    async with AdminHarness(is_admin=True) as harness:
        response = await harness.client.get("/api/v1/admin/overview")
    assert response.status_code == 200
    payload = response.json()
    assert payload["users_total"] == 10
    assert payload["plan_distribution"]["premium"] == 2


@pytest.mark.asyncio
async def test_admin_can_grant_admin_role() -> None:
    async with AdminHarness(is_admin=True) as harness:
        harness.admin.set_user_admin_role.return_value = {
            "updated": True,
            "is_admin": True,
        }
        response = await harness.client.patch(
            f"/api/v1/admin/users/{LEARNER_ID}/admin-role",
            json={"is_admin": True},
        )
    assert response.status_code == 200
    payload = response.json()
    assert payload["updated"] is True
    assert payload["is_admin"] is True


@pytest.mark.asyncio
async def test_admin_role_change_rejects_invalid_operation() -> None:
    async with AdminHarness(is_admin=True) as harness:
        harness.admin.set_user_admin_role.return_value = {
            "updated": False,
            "reason": "cannot_revoke_self",
        }
        response = await harness.client.patch(
            f"/api/v1/admin/users/{ADMIN_ID}/admin-role",
            json={"is_admin": False},
        )
    assert response.status_code == 400
    assert response.json()["detail"] == "cannot_revoke_self"


@pytest.mark.asyncio
async def test_entitlements_endpoint_returns_plan_usage() -> None:
    entitlements = AsyncMock(spec=EntitlementService)
    entitlements.get_summary.return_value = {
        "found": True,
        "plan_id": "free",
        "account_status": "active",
        "max_learner_messages_per_session": 30,
        "usage": {
            "conversation_sessions": {"used": 1, "limit": 2},
            "llm_requests": {"used": 4, "limit": 40},
            "llm_cost_usd": {"used": 0.01, "limit": 0.25},
            "transcriptions": {"used": 0, "limit": 10},
        },
    }

    async def configured_entitlements() -> EntitlementService:
        return entitlements

    app.dependency_overrides[get_current_user] = learner_user
    app.dependency_overrides[get_entitlement_service] = configured_entitlements
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
        headers={"Authorization": "Bearer token"},
    ) as client:
        response = await client.get("/api/v1/account/entitlements")
    app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["plan_id"] == "free"
    assert payload["usage"]["conversation_sessions"]["limit"] == 2
