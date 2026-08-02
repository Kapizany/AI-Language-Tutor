from unittest.mock import AsyncMock

import httpx
import pytest

from app.api.dependencies import get_billing_service
from app.core.security import get_current_user
from app.main import app
from app.schemas.auth import AuthenticatedUser
from app.services.billing import BillingProviderError, BillingService
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
async def test_checkout_session_requires_authentication() -> None:
    billing = AsyncMock(spec=BillingService)

    async def configured_billing() -> BillingService:
        return billing

    app.dependency_overrides[get_billing_service] = configured_billing
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.post(
            "/api/v1/billing/checkout/session",
            json={"billing_cycle": "monthly"},
        )
    app.dependency_overrides.clear()
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_checkout_session_returns_redirect_url() -> None:
    billing = AsyncMock(spec=BillingService)
    billing.create_checkout_session.return_value = {
        "checkout_url": "https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=abc",
        "external_subscription_id": "preapproval-abc",
        "amount": 5.0,
        "currency": "BRL",
        "billing_cycle": "annual",
        "reason": "Lume Tutor Premium - Anual",
        "mock_checkout": False,
    }

    async def configured_billing() -> BillingService:
        return billing

    app.dependency_overrides[get_current_user] = learner_user
    app.dependency_overrides[get_billing_service] = configured_billing

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
        headers={"Authorization": "Bearer token"},
    ) as client:
        response = await client.post(
            "/api/v1/billing/checkout/session",
            json={"billing_cycle": "annual"},
        )
    app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["checkout_url"].startswith(
        "https://www.mercadopago.com.br/subscriptions/checkout"
    )
    assert payload["external_subscription_id"] == "preapproval-abc"
    assert payload["amount"] == 5.0
    assert payload["mock_checkout"] is False
    billing.create_checkout_session.assert_awaited_once()


@pytest.mark.asyncio
async def test_subscribe_activates_premium_in_mock_mode() -> None:
    billing = AsyncMock(spec=BillingService)
    billing.create_subscription_with_card_token.return_value = {
        "plan_id": "premium",
        "subscription_status": "active",
        "external_subscription_id": "preapproval-1",
        "billing_cycle": "monthly",
    }

    async def configured_billing() -> BillingService:
        return billing

    app.dependency_overrides[get_current_user] = learner_user
    app.dependency_overrides[get_billing_service] = configured_billing

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
        headers={"Authorization": "Bearer token"},
    ) as client:
        response = await client.post(
            "/api/v1/billing/subscribe",
            json={
                "billing_cycle": "monthly",
                "card_token_id": "card-token-xyz",
            },
        )
    app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["plan_id"] == "premium"
    billing.create_subscription_with_card_token.assert_awaited_once()


@pytest.mark.asyncio
async def test_subscribe_returns_provider_support_code_without_blame_message() -> None:
    billing = AsyncMock(spec=BillingService)
    billing.create_subscription_with_card_token.side_effect = BillingProviderError(
        "Mercado Pago subscription service failed",
        status_code=500,
        request_id="mp-request-123",
    )

    async def configured_billing() -> BillingService:
        return billing

    app.dependency_overrides[get_current_user] = learner_user
    app.dependency_overrides[get_billing_service] = configured_billing
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
        headers={"Authorization": "Bearer token"},
    ) as client:
        response = await client.post(
            "/api/v1/billing/subscribe",
            json={
                "billing_cycle": "monthly",
                "card_token_id": "card-token-xyz",
            },
        )
    app.dependency_overrides.clear()

    assert response.status_code == 502
    detail = response.json()["detail"]
    assert "mp-request-123" in detail
    assert "e-mail de comprador" not in detail
    assert "cartão de crédito válido" not in detail


@pytest.mark.asyncio
async def test_user_can_cancel_mercado_pago_subscription() -> None:
    billing = AsyncMock(spec=BillingService)
    billing.cancel_subscription.return_value = {
        "subscription_status": "canceled",
        "subscription_ends_at": "2026-09-02T12:00:00Z",
        "external_subscription_id": "preapproval-1",
    }

    async def configured_billing() -> BillingService:
        return billing

    app.dependency_overrides[get_current_user] = learner_user
    app.dependency_overrides[get_billing_service] = configured_billing
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
        headers={"Authorization": "Bearer token"},
    ) as client:
        response = await client.post("/api/v1/billing/subscription/cancel")
    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["subscription_status"] == "canceled"
    assert response.json()["subscription_ends_at"] == "2026-09-02T12:00:00Z"
    billing.cancel_subscription.assert_awaited_once_with(user_id=LEARNER_ID)


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
