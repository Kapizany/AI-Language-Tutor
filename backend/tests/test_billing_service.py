import hashlib
import hmac

import pytest

from app.core.config import Settings
from app.services.billing import BillingService


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
