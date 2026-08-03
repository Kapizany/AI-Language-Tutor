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
    assert "card" in payload["payment_methods"]
    assert "pix_automatic" in payload["payment_methods"]


@pytest.mark.asyncio
async def test_checkout_status_requires_authentication() -> None:
    billing = AsyncMock(spec=BillingService)

    async def configured_billing() -> BillingService:
        return billing

    app.dependency_overrides[get_billing_service] = configured_billing
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get("/api/v1/billing/checkout/status")
    app.dependency_overrides.clear()
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_checkout_status_returns_pending_pix() -> None:
    billing = AsyncMock(spec=BillingService)
    billing.get_checkout_status.return_value = {
        "has_pending_checkout": True,
        "payment_status": "pending",
        "payment_method": "pix_automatic",
        "billing_cycle": "monthly",
        "amount": 5.00,
        "currency": "BRL",
        "external_subscription_id": "pay_777",
        "pix_qr_code": "base64qr",
        "pix_copy_paste": "000201010212",
        "message": "Aguardando pagamento via PIX.",
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
        response = await client.get("/api/v1/billing/checkout/status")
    app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["has_pending_checkout"] is True
    assert payload["pix_qr_code"] == "base64qr"
    billing.get_checkout_status.assert_awaited_once_with(user_id=LEARNER_ID)


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
        "amount": 5.00,
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
    assert payload["amount"] == 5.00
    billing.create_subscription_checkout.assert_awaited_once()


@pytest.mark.asyncio
async def test_checkout_subscribe_returns_provider_error_without_internal_details() -> None:
    billing = AsyncMock(spec=BillingService)
    billing.create_subscription_checkout.side_effect = BillingProviderError(
        "Asaas request failed: internal upstream details",
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
    assert "internal upstream details" not in response.json()["detail"]


@pytest.mark.asyncio
async def test_checkout_subscribe_returns_mapped_asaas_client_error() -> None:
    billing = AsyncMock(spec=BillingService)
    billing.create_subscription_checkout.side_effect = BillingProviderError(
        "Asaas request failed: raw body",
        status_code=400,
        error_codes=["invalid_object"],
        provider_messages=[
            "O valor da cobrança (R$ 2,00) menos o valor do desconto (R$ 0,00) "
            "não pode ser menor que R$ 5,00."
        ],
        user_message=(
            "O valor da cobrança está abaixo do mínimo permitido (R$ 5,00). "
            "Atualize o valor do plano e tente novamente."
        ),
        is_client_error=True,
        method="POST",
        path="/payments",
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
                "billing_cycle": "annual",
                "payment_method": "pix_automatic",
                "cpf": "32502129893",
            },
        )
    app.dependency_overrides.clear()

    assert response.status_code == 422
    assert "mínimo permitido" in response.json()["detail"]
    assert "raw body" not in response.json()["detail"]


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
async def test_billing_history_requires_authentication() -> None:
    billing = AsyncMock(spec=BillingService)

    async def configured_billing() -> BillingService:
        return billing

    app.dependency_overrides[get_billing_service] = configured_billing
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get("/api/v1/billing/history")
    app.dependency_overrides.clear()
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_resume_checkout_returns_pix_payload() -> None:
    billing = AsyncMock(spec=BillingService)
    billing.resume_pending_checkout.return_value = {
        "has_pending_checkout": True,
        "payment_status": "pending",
        "payment_method": "pix_automatic",
        "billing_cycle": "monthly",
        "amount": 5.00,
        "currency": "BRL",
        "external_subscription_id": "pay_777",
        "pix_qr_code": "base64qr",
        "pix_copy_paste": "000201010212",
        "message": "Aguardando pagamento via PIX.",
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
            "/api/v1/billing/checkout/resume",
            json={"external_subscription_id": "pay_777"},
        )
    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["pix_qr_code"] == "base64qr"
    billing.resume_pending_checkout.assert_awaited_once_with(
        user_id=LEARNER_ID,
        external_subscription_id="pay_777",
    )


@pytest.mark.asyncio
async def test_abandon_checkout_cancels_pending() -> None:
    billing = AsyncMock(spec=BillingService)
    billing.abandon_pending_checkout.return_value = {
        "has_pending_checkout": False,
        "checkout_status": "cancelled",
        "payment_status": "canceled",
        "payment_method": "card",
        "billing_cycle": "annual",
        "amount": 5.00,
        "currency": "BRL",
        "external_subscription_id": "sub_123",
        "message": "Cobrança cancelada.",
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
            "/api/v1/billing/checkout/abandon",
            json={"external_subscription_id": "sub_123"},
        )
    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["has_pending_checkout"] is False
    billing.abandon_pending_checkout.assert_awaited_once_with(
        user_id=LEARNER_ID,
        external_subscription_id="sub_123",
    )


@pytest.mark.asyncio
async def test_billing_history_returns_checkouts_and_events() -> None:
    billing = AsyncMock(spec=BillingService)
    billing.get_billing_history.return_value = {
        "subscription": {"plan_id": "premium", "status": "active"},
        "checkouts": [
            {
                "id": 1,
                "billing_cycle": "monthly",
                "payment_method": "pix_automatic",
                "status": "authorized",
                "amount": 2.0,
                "currency": "BRL",
                "created_at": "2026-08-03T10:00:00Z",
            }
        ],
        "events": [
            {
                "id": 10,
                "event_type": "PAYMENT_CONFIRMED",
                "processed_at": "2026-08-03T10:00:01Z",
            }
        ],
        "pending_checkout": None,
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
        response = await client.get("/api/v1/billing/history")
    app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["checkouts"][0]["status"] == "authorized"
    assert payload["events"][0]["event_type"] == "PAYMENT_CONFIRMED"
    billing.get_billing_history.assert_awaited_once_with(user_id=LEARNER_ID)


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
