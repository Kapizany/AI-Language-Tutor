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
    assert payload["plans"]["monthly"]["amount"] == 2.00
    assert payload["plans"]["annual"]["amount"] == 2.00
    assert "card" in payload["payment_methods"]
    assert "pix_automatic" in payload["payment_methods"]


@pytest.mark.asyncio
async def test_checkout_subscribe_requires_authentication() -> None:
    billing = AsyncMock(spec=BillingService)

    async def configured_billing() -> BillingService:
        return billing

    app.dependency_overrides[get_billing_service] = configured_billing
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.post(
            "/api/v1/billing/checkout/subscribe",
            json={
                "billing_cycle": "monthly",
                "payment_method": "card",
                "cpf": "32502129893",
            },
        )
    app.dependency_overrides.clear()
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_checkout_subscribe_returns_pending_status() -> None:
    billing = AsyncMock(spec=BillingService)
    billing.create_subscription_checkout.return_value = {
        "status": "pending",
        "payment_method": "card",
        "external_subscription_id": "sub_abc",
        "amount": 2.00,
        "currency": "BRL",
        "billing_cycle": "monthly",
        "message": "Aguardando confirmação.",
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
            "/api/v1/billing/checkout/subscribe",
            json={
                "billing_cycle": "monthly",
                "payment_method": "card",
                "cpf": "32502129893",
                "card_holder_name": "Learner Test",
                "card_number": "4111111111111111",
                "card_expiry_month": "12",
                "card_expiry_year": "2030",
                "card_cvv": "123",
            },
        )
    app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "pending"
    assert payload["external_subscription_id"] == "sub_abc"
    assert payload["amount"] == 2.00
    billing.create_subscription_checkout.assert_awaited_once()


@pytest.mark.asyncio
async def test_checkout_subscribe_returns_provider_error_without_internal_details() -> None:
    billing = AsyncMock(spec=BillingService)
    billing.create_subscription_checkout.side_effect = BillingProviderError(
        "Asaas request failed",
        status_code=500,
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
            "/api/v1/billing/checkout/subscribe",
            json={
                "billing_cycle": "monthly",
                "payment_method": "card",
                "cpf": "32502129893",
            },
        )
    app.dependency_overrides.clear()

    assert response.status_code == 502
    assert "Asaas request failed" not in response.json()["detail"]


@pytest.mark.asyncio
async def test_user_can_cancel_asaas_subscription() -> None:
    billing = AsyncMock(spec=BillingService)
    billing.cancel_subscription.return_value = {
        "subscription_status": "canceled",
        "subscription_ends_at": "2026-09-02T12:00:00Z",
        "external_subscription_id": "sub_1",
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
    billing.cancel_subscription.assert_awaited_once_with(user_id=LEARNER_ID)


@pytest.mark.asyncio
async def test_webhook_rejects_invalid_token() -> None:
    billing = AsyncMock(spec=BillingService)
    billing.verify_webhook_token.return_value = False

    async def configured_billing() -> BillingService:
        return billing

    app.dependency_overrides[get_billing_service] = configured_billing
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.post(
            "/api/v1/billing/webhook",
            json={"event": "PAYMENT_CONFIRMED"},
            headers={"asaas-access-token": "invalid"},
        )
    app.dependency_overrides.clear()

    assert response.status_code == 401
    billing.handle_webhook.assert_not_awaited()


@pytest.mark.asyncio
async def test_webhook_processes_valid_token() -> None:
    billing = AsyncMock(spec=BillingService)
    billing.verify_webhook_token.return_value = True
    billing.handle_webhook.return_value = {"processed": True, "plan_id": "premium"}

    async def configured_billing() -> BillingService:
        return billing

    app.dependency_overrides[get_billing_service] = configured_billing
    payload = {
        "id": "evt_1",
        "event": "PAYMENT_CONFIRMED",
        "payment": {"id": "pay_1", "externalReference": "ref"},
    }
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.post(
            "/api/v1/billing/webhook",
            json=payload,
            headers={"asaas-access-token": "valid-token"},
        )
    app.dependency_overrides.clear()

    assert response.status_code == 200
    billing.handle_webhook.assert_awaited_once_with(payload)
