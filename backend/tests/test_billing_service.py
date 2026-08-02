import hashlib
import hmac

import pytest

from app.core.config import Settings
from app.services.billing import (
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
