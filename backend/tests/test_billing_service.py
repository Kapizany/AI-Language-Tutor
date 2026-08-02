import hashlib
import hmac
import json
from uuid import UUID

import httpx
import pytest

from app.core.config import Settings
from app.services.billing import (
    MERCADOPAGO_TEST_PAYER_EMAIL,
    BillingService,
    is_mercadopago_simulation_webhook,
    parse_mercadopago_webhook_payload,
)


@pytest.mark.asyncio
async def test_mercadopago_webhook_signature_is_verified() -> None:
    settings = Settings(
        _env_file=None,
        mercadopago_webhook_secret="webhook-secret",
    )
    service = BillingService(settings)
    manifest = "id:preapproval-1;request-id:request-1;ts:1710000000;"
    digest = hmac.new(
        b"webhook-secret",
        manifest.encode(),
        hashlib.sha256,
    ).hexdigest()

    try:
        assert service.verify_webhook_signature(
            resource_id="preapproval-1",
            request_id="request-1",
            signature=f"ts=1710000000,v1={digest}",
        )
        assert not service.verify_webhook_signature(
            resource_id="preapproval-1",
            request_id="request-1",
            signature="ts=1710000000,v1=invalid",
        )
    finally:
        await service.close()


@pytest.mark.asyncio
async def test_webhook_signature_requires_all_fields() -> None:
    service = BillingService(Settings(_env_file=None, mercadopago_webhook_secret="webhook-secret"))
    try:
        assert not service.verify_webhook_signature(
            resource_id=None,
            request_id="request-1",
            signature="ts=1,v1=value",
        )
        assert not service.verify_webhook_signature(
            resource_id="preapproval-1",
            request_id=None,
            signature="ts=1,v1=value",
        )
    finally:
        await service.close()


def test_parse_mercadopago_webhook_payload_reads_subscription_body() -> None:
    body = {
        "action": "updated",
        "data": {"id": "123456"},
        "id": "123456",
        "type": "subscription_preapproval",
        "live_mode": False,
    }
    resource_id, topic, payload = parse_mercadopago_webhook_payload(body)
    assert resource_id == "123456"
    assert topic == "subscription_preapproval"
    assert payload == body
    assert is_mercadopago_simulation_webhook(resource_id=resource_id, payload=payload)


@pytest.mark.asyncio
async def test_handle_notification_acknowledges_simulation_without_mercado_pago_lookup() -> None:
    service = BillingService(
        Settings(
            _env_file=None,
            mercadopago_access_token="TEST-token",
            supabase_url="https://example.supabase.co",
            supabase_service_role_key="service-role-key",
            mercadopago_mock_checkout=False,
        )
    )
    try:
        result = await service.handle_notification(
            resource_id="123456",
            topic="subscription_preapproval",
            payload={
                "type": "subscription_preapproval",
                "data": {"id": "123456"},
                "live_mode": False,
            },
        )
        assert result == {
            "processed": True,
            "simulation": True,
            "reason": "simulation_acknowledged",
        }
    finally:
        await service.close()


@pytest.mark.asyncio
async def test_test_checkout_always_uses_sandbox_payer_email() -> None:
    service = BillingService(
        Settings(
            _env_file=None,
            mercadopago_test_checkout=True,
        )
    )
    try:
        assert service._checkout_payer_email("real-user@example.com") == (
            MERCADOPAGO_TEST_PAYER_EMAIL
        )
        assert service._checkout_payer_email(None) == MERCADOPAGO_TEST_PAYER_EMAIL
    finally:
        await service.close()


@pytest.mark.asyncio
async def test_production_checkout_preserves_authenticated_user_email() -> None:
    service = BillingService(
        Settings(
            _env_file=None,
            mercadopago_test_checkout=False,
        )
    )
    try:
        assert service._checkout_payer_email("real-user@example.com") == "real-user@example.com"
        assert service._checkout_payer_email(None) is None
    finally:
        await service.close()


@pytest.mark.asyncio
async def test_billing_rpc_accepts_no_content_response() -> None:
    service = BillingService(
        Settings(
            _env_file=None,
            supabase_url="https://example.supabase.co",
            supabase_service_role_key="service-role-key",
        )
    )
    await service.db.aclose()
    service.db = httpx.AsyncClient(
        base_url="https://example.supabase.co/rest/v1",
        headers={"apikey": "service-role-key"},
        transport=httpx.MockTransport(lambda request: httpx.Response(204, request=request)),
    )
    try:
        assert await service._rpc("release_billing_checkout_attempt", {}) is None
    finally:
        await service.close()


@pytest.mark.asyncio
async def test_pending_checkout_is_reused_instead_of_creating_duplicate() -> None:
    service = BillingService(
        Settings(
            _env_file=None,
            mercadopago_access_token="APP_USR-production-token",
            supabase_url="https://example.supabase.co",
            supabase_service_role_key="service-role-key",
        )
    )
    await service.db.aclose()
    await service.mp.aclose()

    def db_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            request=request,
            json=[
                {
                    "external_subscription_id": "preapproval-123",
                    "billing_cycle": "annual",
                    "status": "pending",
                }
            ],
        )

    mercado_pago_methods: list[str] = []

    def mp_handler(request: httpx.Request) -> httpx.Response:
        mercado_pago_methods.append(request.method)
        if request.method == "PUT":
            payload = json.loads(request.content)
            assert payload["auto_recurring"]["transaction_amount"] == 5.0
            return httpx.Response(200, request=request, json={"status": "pending"})
        return httpx.Response(
            200,
            request=request,
            json={
                "id": "preapproval-123",
                "status": "pending",
                "init_point": "https://www.mercadopago.com.br/subscriptions/checkout",
                "auto_recurring": {
                    "transaction_amount": 1,
                    "currency_id": "BRL",
                },
            },
        )

    service.db = httpx.AsyncClient(
        base_url="https://example.supabase.co/rest/v1",
        headers={"apikey": "service-role-key"},
        transport=httpx.MockTransport(db_handler),
    )
    service.mp = httpx.AsyncClient(
        base_url="https://api.mercadopago.com",
        transport=httpx.MockTransport(mp_handler),
    )
    try:
        result = await service._load_reusable_checkout(
            user_id=UUID("00000000-0000-0000-0000-000000000001"),
            billing_cycle="annual",
        )
        assert result == {
            "checkout_url": "https://www.mercadopago.com.br/subscriptions/checkout",
            "external_subscription_id": "preapproval-123",
        }
        assert mercado_pago_methods == ["GET", "PUT"]
    finally:
        await service.close()
