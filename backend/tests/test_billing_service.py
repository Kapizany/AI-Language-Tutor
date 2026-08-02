import hashlib
import hmac
import json
from uuid import UUID

import httpx
import pytest

from app.core.config import Settings
from app.services.billing import (
    MERCADOPAGO_TEST_PAYER_EMAIL,
    BillingCredentialMismatchError,
    BillingProviderError,
    BillingSellerIsBuyerError,
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
async def test_subscribe_rejects_when_payer_email_matches_collector() -> None:
    service = BillingService(
        Settings(
            _env_file=None,
            mercadopago_billing_enabled=True,
            mercadopago_access_token="APP_USR-production-token",
            mercadopago_public_key="APP_USR-public-key",
            supabase_url="https://example.supabase.co",
            supabase_service_role_key="service-role-key",
            mercadopago_mock_checkout=False,
        )
    )
    await service.mp.aclose()
    service.mp = httpx.AsyncClient(
        base_url="https://api.mercadopago.com",
        transport=httpx.MockTransport(
            lambda request: httpx.Response(
                200,
                request=request,
                json={"email": "seller@example.com"},
            )
        ),
    )
    try:
        with pytest.raises(BillingSellerIsBuyerError):
            await service._assert_payer_is_not_collector("seller@example.com")
    finally:
        await service.close()


@pytest.mark.asyncio
async def test_preapproval_back_url_strips_spa_fragment() -> None:
    service = BillingService(
        Settings(
            _env_file=None,
            mercadopago_back_url="https://ai-language-tutor.caps-labs.com/#/billing/success",
        )
    )
    try:
        assert service._preapproval_back_url() == "https://ai-language-tutor.caps-labs.com/"
    finally:
        await service.close()


@pytest.mark.asyncio
async def test_mismatched_public_key_and_access_token_are_rejected() -> None:
    service = BillingService(
        Settings(
            _env_file=None,
            mercadopago_billing_enabled=True,
            mercadopago_access_token="APP_USR-production-token",
            mercadopago_public_key="TEST-public-key",
            supabase_url="https://example.supabase.co",
            supabase_service_role_key="service-role-key",
            mercadopago_mock_checkout=False,
        )
    )
    try:
        with pytest.raises(BillingCredentialMismatchError):
            service._assert_matching_credentials()
    finally:
        await service.close()


@pytest.mark.asyncio
async def test_card_token_must_be_accessible_with_configured_access_token() -> None:
    service = BillingService(Settings(_env_file=None))
    await service.mp.aclose()
    service.mp = httpx.AsyncClient(
        base_url="https://api.mercadopago.com",
        transport=httpx.MockTransport(
            lambda request: httpx.Response(
                404,
                request=request,
                json={"message": "Card token service not found"},
            )
        ),
    )
    try:
        with pytest.raises(BillingCredentialMismatchError):
            await service._validate_card_token("card-token-from-another-app")
    finally:
        await service.close()


@pytest.mark.asyncio
async def test_card_token_validation_preserves_provider_request_id() -> None:
    service = BillingService(Settings(_env_file=None))
    await service.mp.aclose()
    service.mp = httpx.AsyncClient(
        base_url="https://api.mercadopago.com",
        transport=httpx.MockTransport(
            lambda request: httpx.Response(
                500,
                request=request,
                headers={"x-request-id": "mp-request-123"},
                json={"message": "Internal server error"},
            )
        ),
    )
    try:
        with pytest.raises(BillingProviderError) as raised:
            await service._validate_card_token("card-token")
        assert raised.value.status_code == 500
        assert raised.value.request_id == "mp-request-123"
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
async def test_create_subscription_with_card_token_authorizes_preapproval() -> None:
    user_id = UUID("00000000-0000-0000-0000-000000000001")
    service = BillingService(
        Settings(
            _env_file=None,
            mercadopago_billing_enabled=True,
            mercadopago_access_token="APP_USR-production-token",
            mercadopago_public_key="APP_USR-public-key",
            supabase_url="https://example.supabase.co",
            supabase_service_role_key="service-role-key",
            mercadopago_mock_checkout=False,
            mercadopago_test_checkout=False,
        )
    )
    await service.db.aclose()
    await service.mp.aclose()

    rpc_calls: list[str] = []
    authorize_idempotency_keys: list[str] = []

    def db_handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path.endswith("/billing_checkouts"):
            return httpx.Response(200, request=request, json=[])
        if path.endswith("/rpc/reserve_billing_checkout_attempt"):
            rpc_calls.append("reserve")
            return httpx.Response(200, request=request, json={"allowed": True})
        if path.endswith("/rpc/create_billing_checkout"):
            rpc_calls.append("create_checkout")
            return httpx.Response(204, request=request)
        if path.endswith("/rpc/process_billing_event"):
            rpc_calls.append("process_event")
            return httpx.Response(
                200,
                request=request,
                json={
                    "updated": True,
                    "plan_id": "premium",
                    "subscription_status": "active",
                },
            )
        return httpx.Response(500, request=request, json={"error": path})

    def mp_handler(request: httpx.Request) -> httpx.Response:
        if request.method == "GET" and "/v1/card_tokens/" in request.url.path:
            return httpx.Response(
                200,
                request=request,
                json={"id": "card-token-abc123", "status": "active"},
            )
        if request.method == "POST" and request.url.path.endswith("/preapproval"):
            payload = json.loads(request.content)
            assert payload["status"] == "pending"
            assert "card_token_id" not in payload
            assert payload["payer_email"] == "learner@example.test"
            assert payload["auto_recurring"]["transaction_amount"] == 5.0
            assert "start_date" not in payload["auto_recurring"]
            assert "end_date" not in payload["auto_recurring"]
            assert "#" not in payload["back_url"]
            return httpx.Response(
                201,
                request=request,
                json={
                    "id": "preapproval-999",
                    "status": "pending",
                    "external_reference": f"{user_id}:monthly",
                    "payer_id": 42,
                },
            )
        if request.method == "PUT" and request.url.path.endswith("/preapproval/preapproval-999"):
            authorize_idempotency_keys.append(request.headers["X-Idempotency-Key"])
            payload = json.loads(request.content)
            assert payload == {
                "status": "authorized",
                "card_token_id": "card-token-abc123",
            }
            return httpx.Response(
                200,
                request=request,
                json={
                    "id": "preapproval-999",
                    "status": "authorized",
                    "external_reference": f"{user_id}:monthly",
                    "payer_id": 42,
                },
            )
        if request.method == "GET" and "/preapproval/" in request.url.path:
            return httpx.Response(
                200,
                request=request,
                json={
                    "id": "preapproval-999",
                    "status": "authorized",
                    "external_reference": f"{user_id}:monthly",
                    "payer_id": 42,
                    "next_payment_date": None,
                },
            )
        return httpx.Response(500, request=request, text=f"unexpected {request.url}")

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
        result = await service.create_subscription_with_card_token(
            user_id=user_id,
            user_email="learner@example.test",
            billing_cycle="monthly",
            card_token_id="card-token-abc123",
        )
        assert result["plan_id"] == "premium"
        assert result["external_subscription_id"] == "preapproval-999"
        assert result["billing_cycle"] == "monthly"
        assert rpc_calls == ["reserve", "create_checkout", "process_event"]
        assert authorize_idempotency_keys == [
            service._authorize_preapproval_idempotency_key(
                preapproval_id="preapproval-999",
                card_token_id="card-token-abc123",
            )
        ]
        assert authorize_idempotency_keys[0] != service._authorize_preapproval_idempotency_key(
            preapproval_id="preapproval-999",
            card_token_id="different-card-token",
        )
    finally:
        await service.close()


@pytest.mark.asyncio
async def test_cancel_subscription_keeps_access_until_next_payment_date() -> None:
    user_id = UUID("00000000-0000-0000-0000-000000000001")
    service = BillingService(
        Settings(
            _env_file=None,
            mercadopago_billing_enabled=True,
            mercadopago_access_token="APP_USR-production-token",
            mercadopago_public_key="APP_USR-public-key",
            supabase_url="https://example.supabase.co",
            supabase_service_role_key="service-role-key",
        )
    )
    await service.db.aclose()
    await service.mp.aclose()

    def db_handler(request: httpx.Request) -> httpx.Response:
        if request.method == "GET" and request.url.path.endswith("/user_subscriptions"):
            return httpx.Response(
                200,
                request=request,
                json=[
                    {
                        "plan_id": "premium",
                        "status": "active",
                        "started_at": "2026-08-02T12:00:00Z",
                        "ends_at": None,
                        "renews_at": "2026-09-02T12:00:00Z",
                        "billing_cycle": "monthly",
                        "subscription_source": "mercadopago",
                        "external_subscription_id": "preapproval-999",
                    }
                ],
            )
        if request.url.path.endswith("/rpc/process_billing_event"):
            return httpx.Response(
                200,
                request=request,
                json={
                    "updated": True,
                    "plan_id": "premium",
                    "subscription_status": "canceled",
                    "ends_at": "2026-09-02T12:00:00+00:00",
                },
            )
        return httpx.Response(500, request=request)

    preapproval_gets = 0

    def mp_handler(request: httpx.Request) -> httpx.Response:
        nonlocal preapproval_gets
        if request.method == "GET" and request.url.path.endswith("/preapproval/preapproval-999"):
            preapproval_gets += 1
            return httpx.Response(
                200,
                request=request,
                json={
                    "id": "preapproval-999",
                    "status": "active" if preapproval_gets == 1 else "cancelled",
                    "external_reference": f"{user_id}:monthly",
                    "payer_id": 42,
                    "date_created": "2026-08-02T12:00:00Z",
                    "next_payment_date": (
                        "2026-09-02T12:00:00Z" if preapproval_gets == 1 else None
                    ),
                },
            )
        if request.method == "PUT" and request.url.path.endswith("/preapproval/preapproval-999"):
            assert json.loads(request.content) == {"status": "cancelled"}
            return httpx.Response(200, request=request, json={"status": "cancelled"})
        return httpx.Response(500, request=request)

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
        result = await service.cancel_subscription(user_id=user_id)
        assert result["subscription_status"] == "canceled"
        assert result["subscription_ends_at"] == "2026-09-02T12:00:00+00:00"
        assert preapproval_gets == 2
    finally:
        await service.close()


@pytest.mark.asyncio
async def test_handle_notification_resolves_authorized_payment_to_preapproval() -> None:
    user_id = UUID("00000000-0000-0000-0000-000000000001")
    service = BillingService(
        Settings(
            _env_file=None,
            mercadopago_access_token="APP_USR-production-token",
            supabase_url="https://example.supabase.co",
            supabase_service_role_key="service-role-key",
            mercadopago_mock_checkout=False,
        )
    )
    await service.db.aclose()
    await service.mp.aclose()

    mp_paths: list[str] = []

    def db_handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/rpc/process_billing_event"):
            return httpx.Response(
                200,
                request=request,
                json={
                    "updated": True,
                    "plan_id": "premium",
                    "subscription_status": "active",
                },
            )
        return httpx.Response(500, request=request, json={"error": request.url.path})

    def mp_handler(request: httpx.Request) -> httpx.Response:
        mp_paths.append(request.url.path)
        if request.url.path.endswith("/authorized_payments/7030522288"):
            return httpx.Response(
                200,
                request=request,
                json={
                    "id": 7030522288,
                    "preapproval_id": "preapproval-abc",
                    "status": "processed",
                },
            )
        if request.url.path.endswith("/preapproval/preapproval-abc"):
            return httpx.Response(
                200,
                request=request,
                json={
                    "id": "preapproval-abc",
                    "status": "authorized",
                    "external_reference": f"{user_id}:annual",
                    "payer_id": 99,
                    "next_payment_date": None,
                },
            )
        return httpx.Response(404, request=request, text="missing")

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
        result = await service.handle_notification(
            resource_id="7030522288",
            topic="subscription_authorized_payment",
            payload={
                "type": "subscription_authorized_payment",
                "data": {"id": "7030522288"},
                "live_mode": True,
            },
        )
        assert result.get("plan_id") == "premium" or result.get("updated") is True
        assert "/authorized_payments/7030522288" in mp_paths
        assert "/preapproval/preapproval-abc" in mp_paths
        assert "/preapproval/7030522288" not in mp_paths
    finally:
        await service.close()
