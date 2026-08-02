from uuid import UUID

import httpx
import pytest

from app.core.config import Settings
from app.services.billing import (
    PRICING,
    AlreadyPremiumError,
    BillingService,
    BillingValidationError,
)


@pytest.mark.asyncio
async def test_normalize_cpf_rejects_invalid_length() -> None:
    service = BillingService(Settings(_env_file=None))
    try:
        with pytest.raises(BillingValidationError):
            service.normalize_cpf("123")
        assert service.normalize_cpf("325.021.298-93") == "32502129893"
    finally:
        await service.close()


@pytest.mark.asyncio
async def test_parse_external_reference() -> None:
    service = BillingService(Settings(_env_file=None))
    try:
        user_id, cycle, method = service.parse_external_reference(
            "00000000-0000-0000-0000-000000000001:monthly:card"
        )
        assert user_id == UUID("00000000-0000-0000-0000-000000000001")
        assert cycle == "monthly"
        assert method == "card"
    finally:
        await service.close()


@pytest.mark.asyncio
async def test_verify_webhook_token() -> None:
    service = BillingService(
        Settings(
            _env_file=None,
            asaas_webhook_access_token="secret-token",
            asaas_mock_checkout=False,
        )
    )
    try:
        assert service.verify_webhook_token("secret-token")
        assert not service.verify_webhook_token("wrong")
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
async def test_create_card_checkout_stays_pending() -> None:
    user_id = UUID("00000000-0000-0000-0000-000000000001")
    service = BillingService(
        Settings(
            _env_file=None,
            asaas_billing_enabled=True,
            asaas_api_key="asaas-key",
            supabase_url="https://example.supabase.co",
            supabase_service_role_key="service-role-key",
            asaas_mock_checkout=False,
        )
    )
    await service.db.aclose()
    await service.asaas.aclose()

    rpc_calls: list[str] = []

    def db_handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/rpc/reserve_billing_checkout_attempt"):
            rpc_calls.append("reserve")
            return httpx.Response(200, request=request, json={"allowed": True})
        if request.url.path.endswith("/rpc/create_billing_checkout"):
            rpc_calls.append("create_checkout")
            return httpx.Response(204, request=request)
        return httpx.Response(500, request=request, json={"error": request.url.path})

    def asaas_handler(request: httpx.Request) -> httpx.Response:
        if request.method == "GET" and request.url.path.endswith("/customers"):
            return httpx.Response(200, request=request, json={"data": []})
        if request.method == "POST" and request.url.path.endswith("/customers"):
            return httpx.Response(200, request=request, json={"id": "cus_123"})
        if request.method == "POST" and request.url.path.endswith("/subscriptions"):
            return httpx.Response(
                200,
                request=request,
                json={"id": "sub_999", "status": "ACTIVE"},
            )
        return httpx.Response(500, request=request, text=f"unexpected {request.url}")

    service.db = httpx.AsyncClient(
        base_url="https://example.supabase.co/rest/v1",
        headers={"apikey": "service-role-key"},
        transport=httpx.MockTransport(db_handler),
    )
    service.asaas = httpx.AsyncClient(
        base_url="https://api-sandbox.asaas.com/v3",
        transport=httpx.MockTransport(asaas_handler),
    )
    try:
        result = await service.create_subscription_checkout(
            user_id=user_id,
            user_email="learner@example.test",
            display_name="Learner",
            billing_cycle="monthly",
            payment_method="card",
            cpf="32502129893",
            remote_ip="127.0.0.1",
            card_holder_name="Learner Test",
            card_number="4111111111111111",
            card_expiry_month="12",
            card_expiry_year="2030",
            card_cvv="123",
        )
        assert result["status"] == "pending"
        assert result["external_subscription_id"] == "sub_999"
        assert result["amount"] == PRICING["monthly"]["amount"]
        assert rpc_calls == ["reserve", "create_checkout"]
    finally:
        await service.close()


@pytest.mark.asyncio
async def test_create_pix_checkout_returns_qr_payload() -> None:
    user_id = UUID("00000000-0000-0000-0000-000000000001")
    service = BillingService(
        Settings(
            _env_file=None,
            asaas_billing_enabled=True,
            asaas_api_key="asaas-key",
            supabase_url="https://example.supabase.co",
            supabase_service_role_key="service-role-key",
        )
    )
    await service.db.aclose()
    await service.asaas.aclose()

    def db_handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/rpc/reserve_billing_checkout_attempt"):
            return httpx.Response(200, request=request, json={"allowed": True})
        if request.url.path.endswith("/rpc/create_billing_checkout"):
            return httpx.Response(204, request=request)
        return httpx.Response(500, request=request)

    def asaas_handler(request: httpx.Request) -> httpx.Response:
        if request.method == "GET" and request.url.path.endswith("/customers"):
            return httpx.Response(200, request=request, json={"data": [{"id": "cus_123"}]})
        if request.method == "POST" and request.url.path.endswith("/payments"):
            return httpx.Response(
                200,
                request=request,
                json={
                    "id": "pay_777",
                    "encodedImage": "base64qr",
                    "payload": "000201010212",
                },
            )
        return httpx.Response(500, request=request)

    service.db = httpx.AsyncClient(
        base_url="https://example.supabase.co/rest/v1",
        headers={"apikey": "service-role-key"},
        transport=httpx.MockTransport(db_handler),
    )
    service.asaas = httpx.AsyncClient(
        base_url="https://api-sandbox.asaas.com/v3",
        transport=httpx.MockTransport(asaas_handler),
    )
    try:
        result = await service.create_subscription_checkout(
            user_id=user_id,
            user_email="learner@example.test",
            display_name=None,
            billing_cycle="annual",
            payment_method="pix_automatic",
            cpf="32502129893",
            remote_ip="127.0.0.1",
        )
        assert result["status"] == "pending"
        assert result["pix_qr_code"] == "base64qr"
        assert result["pix_copy_paste"] == "000201010212"
    finally:
        await service.close()


@pytest.mark.asyncio
async def test_create_pix_checkout_fetches_qr_from_secondary_endpoint() -> None:
    user_id = UUID("00000000-0000-0000-0000-000000000001")
    service = BillingService(
        Settings(
            _env_file=None,
            asaas_billing_enabled=True,
            asaas_api_key="asaas-key",
            supabase_url="https://example.supabase.co",
            supabase_service_role_key="service-role-key",
        )
    )
    await service.db.aclose()
    await service.asaas.aclose()

    def db_handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/rpc/reserve_billing_checkout_attempt"):
            return httpx.Response(200, request=request, json={"allowed": True})
        if request.url.path.endswith("/rpc/create_billing_checkout"):
            return httpx.Response(204, request=request)
        return httpx.Response(500, request=request)

    def asaas_handler(request: httpx.Request) -> httpx.Response:
        if request.method == "GET" and request.url.path.endswith("/customers"):
            return httpx.Response(200, request=request, json={"data": [{"id": "cus_123"}]})
        if request.method == "POST" and request.url.path.endswith("/payments"):
            return httpx.Response(200, request=request, json={"id": "pay_777"})
        if request.method == "GET" and request.url.path.endswith("/pixQrCode"):
            return httpx.Response(
                200,
                request=request,
                json={"encodedImage": "base64qr", "payload": "000201010212"},
            )
        return httpx.Response(500, request=request)

    service.db = httpx.AsyncClient(
        base_url="https://example.supabase.co/rest/v1",
        headers={"apikey": "service-role-key"},
        transport=httpx.MockTransport(db_handler),
    )
    service.asaas = httpx.AsyncClient(
        base_url="https://api-sandbox.asaas.com/v3",
        transport=httpx.MockTransport(asaas_handler),
    )
    try:
        result = await service.create_subscription_checkout(
            user_id=user_id,
            user_email="learner@example.test",
            display_name=None,
            billing_cycle="annual",
            payment_method="pix_automatic",
            cpf="32502129893",
            remote_ip="127.0.0.1",
        )
        assert result["pix_qr_code"] == "base64qr"
        assert result["pix_copy_paste"] == "000201010212"
    finally:
        await service.close()


@pytest.mark.asyncio
async def test_handle_webhook_activates_premium_on_payment_confirmed() -> None:
    user_id = UUID("00000000-0000-0000-0000-000000000001")
    service = BillingService(
        Settings(
            _env_file=None,
            asaas_api_key="asaas-key",
            supabase_url="https://example.supabase.co",
            supabase_service_role_key="service-role-key",
        )
    )
    await service.db.aclose()
    await service.asaas.aclose()

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
        return httpx.Response(500, request=request)

    def asaas_handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/customers/cus_123"):
            return httpx.Response(200, request=request, json={"email": "learner@example.test"})
        return httpx.Response(404, request=request)

    service.db = httpx.AsyncClient(
        base_url="https://example.supabase.co/rest/v1",
        headers={"apikey": "service-role-key"},
        transport=httpx.MockTransport(db_handler),
    )
    service.asaas = httpx.AsyncClient(
        base_url="https://api-sandbox.asaas.com/v3",
        transport=httpx.MockTransport(asaas_handler),
    )
    try:
        result = await service.handle_webhook(
            {
                "id": "evt_1",
                "event": "PAYMENT_CONFIRMED",
                "payment": {
                    "id": "pay_777",
                    "customer": "cus_123",
                    "externalReference": f"{user_id}:monthly:pix_automatic",
                },
            }
        )
        assert result["processed"] is True
        assert result["plan_id"] == "premium"
    finally:
        await service.close()


@pytest.mark.asyncio
async def test_create_checkout_rejects_already_premium() -> None:
    user_id = UUID("00000000-0000-0000-0000-000000000001")
    service = BillingService(
        Settings(
            _env_file=None,
            asaas_billing_enabled=True,
            asaas_api_key="asaas-key",
            supabase_url="https://example.supabase.co",
            supabase_service_role_key="service-role-key",
        )
    )
    await service.db.aclose()
    service.db = httpx.AsyncClient(
        base_url="https://example.supabase.co/rest/v1",
        headers={"apikey": "service-role-key"},
        transport=httpx.MockTransport(
            lambda request: (
                httpx.Response(
                    200,
                    request=request,
                    json={"allowed": False, "reason": "already_premium"},
                )
                if request.url.path.endswith("/rpc/reserve_billing_checkout_attempt")
                else httpx.Response(500, request=request)
            )
        ),
    )
    try:
        with pytest.raises(AlreadyPremiumError):
            await service.create_subscription_checkout(
                user_id=user_id,
                user_email="learner@example.test",
                display_name=None,
                billing_cycle="monthly",
                payment_method="pix_automatic",
                cpf="32502129893",
                remote_ip="127.0.0.1",
            )
    finally:
        await service.close()
