from unittest.mock import AsyncMock

import httpx
import pytest

from app.api.dependencies import get_billing_service, get_entitlement_service
from app.core.security import get_current_user
from app.main import app
from app.schemas.auth import AuthenticatedUser
from app.services.billing import BillingService
from app.services.entitlements import EntitlementService
from tests.support import LEARNER_ID


async def learner_user() -> AuthenticatedUser:
    return AuthenticatedUser(id=LEARNER_ID, email="learner@example.test")


@pytest.mark.asyncio
async def test_billing_plans_are_public() -> None:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get("/api/v1/billing/plans")
    assert response.status_code == 200
    payload = response.json()
    assert payload["plans"]["monthly"]["amount"] == 5.00
    assert payload["plans"]["annual"]["amount"] == 5.00


@pytest.mark.asyncio
async def test_checkout_requires_authentication() -> None:
    billing = AsyncMock(spec=BillingService)

    async def configured_billing() -> BillingService:
        return billing

    app.dependency_overrides[get_billing_service] = configured_billing
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.post(
            "/api/v1/billing/checkout",
            json={"billing_cycle": "monthly"},
        )
    app.dependency_overrides.clear()
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_checkout_returns_mercado_pago_url() -> None:
    billing = AsyncMock(spec=BillingService)
    billing.create_checkout.return_value = {
        "checkout_url": "https://www.mercadopago.com.br/subscriptions/checkout?mock=1",
        "external_subscription_id": "mock:123:monthly",
    }

    entitlements = AsyncMock(spec=EntitlementService)
    entitlements.get_summary.return_value = {
        "found": True,
        "plan_id": "free",
        "account_status": "active",
        "max_learner_messages_per_session": 30,
        "subscription_status": "active",
        "subscription_ends_at": None,
        "billing_cycle": None,
        "subscription_source": "system",
        "can_manage_billing": False,
        "usage": {},
    }

    async def configured_billing() -> BillingService:
        return billing

    async def configured_entitlements() -> EntitlementService:
        return entitlements

    app.dependency_overrides[get_current_user] = learner_user
    app.dependency_overrides[get_billing_service] = configured_billing
    app.dependency_overrides[get_entitlement_service] = configured_entitlements

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
        headers={"Authorization": "Bearer token"},
    ) as client:
        response = await client.post(
            "/api/v1/billing/checkout",
            json={"billing_cycle": "monthly"},
        )
    app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["checkout_url"].startswith("https://")
    billing.create_checkout.assert_awaited_once()


@pytest.mark.asyncio
async def test_webhook_rejects_invalid_signature() -> None:
    billing = AsyncMock(spec=BillingService)
    billing.verify_webhook_signature.return_value = False

    async def configured_billing() -> BillingService:
        return billing

    app.dependency_overrides[get_billing_service] = configured_billing
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.post(
            "/api/v1/billing/webhook?data.id=preapproval-1&topic=subscription_preapproval",
            headers={
                "x-request-id": "request-1",
                "x-signature": "ts=123,v1=invalid",
            },
        )
    app.dependency_overrides.clear()

    assert response.status_code == 401
    billing.handle_notification.assert_not_awaited()


@pytest.mark.asyncio
async def test_webhook_processes_valid_signature() -> None:
    billing = AsyncMock(spec=BillingService)
    billing.verify_webhook_signature.return_value = True
    billing.handle_notification.return_value = {"processed": True}

    async def configured_billing() -> BillingService:
        return billing

    app.dependency_overrides[get_billing_service] = configured_billing
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.post(
            "/api/v1/billing/webhook?data.id=preapproval-1&topic=subscription_preapproval",
            headers={
                "x-request-id": "request-1",
                "x-signature": "ts=123,v1=valid",
            },
        )
    app.dependency_overrides.clear()

    assert response.status_code == 200
    billing.handle_notification.assert_awaited_once_with(
        resource_id="preapproval-1",
        topic="subscription_preapproval",
        payload=None,
    )


@pytest.mark.asyncio
async def test_webhook_accepts_mercadopago_simulation_payload() -> None:
    billing = AsyncMock(spec=BillingService)
    billing.verify_webhook_signature.return_value = True
    billing.handle_notification.return_value = {
        "processed": True,
        "simulation": True,
        "reason": "simulation_acknowledged",
    }
    simulation_payload = {
        "action": "updated",
        "data": {"id": "123456"},
        "id": "123456",
        "type": "subscription_preapproval",
        "live_mode": False,
    }

    async def configured_billing() -> BillingService:
        return billing

    app.dependency_overrides[get_billing_service] = configured_billing
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.post(
            "/api/v1/billing/webhook",
            json=simulation_payload,
            headers={
                "x-request-id": "request-1",
                "x-signature": "ts=123,v1=valid",
            },
        )
    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["simulation"] is True
    billing.handle_notification.assert_awaited_once_with(
        resource_id="123456",
        topic="subscription_preapproval",
        payload=simulation_payload,
    )
