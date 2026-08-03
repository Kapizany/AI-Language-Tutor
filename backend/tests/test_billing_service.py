import json
from uuid import UUID

import httpx
import pytest

from app.core.config import Settings
from app.services.billing import (
    PRICING,
    AlreadyPremiumError,
    BillingProviderError,
    BillingService,
    BillingValidationError,
    map_asaas_errors_for_user,
)


def test_map_asaas_errors_for_user_maps_minimum_charge() -> None:
    message, is_client_error = map_asaas_errors_for_user(
        status_code=400,
        errors=[
            {
                "code": "invalid_object",
                "description": (
                    "O valor da cobrança (R$ 2,00) menos o valor do desconto (R$ 0,00) "
                    "não pode ser menor que R$ 5,00."
                ),
            }
        ],
    )
    assert is_client_error is True
    assert message is not None
    assert "R$ 5,00" in message


def test_map_asaas_errors_for_user_keeps_unknown_server_errors_generic() -> None:
    message, is_client_error = map_asaas_errors_for_user(
        status_code=500,
        errors=[{"code": "unknown", "description": "Falha interna"}],
    )
    assert is_client_error is False
    assert message is None


@pytest.mark.asyncio
async def test_asaas_request_raises_structured_provider_error() -> None:
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

    def asaas_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            400,
            request=request,
            json={
                "errors": [
                    {
                        "code": "invalid_object",
                        "description": (
                            "O valor da cobrança (R$ 2,00) menos o valor do desconto "
                            "(R$ 0,00) não pode ser menor que R$ 5,00."
                        ),
                    }
                ]
            },
        )

    service.asaas = httpx.AsyncClient(
        base_url="https://api-sandbox.asaas.com/v3",
        transport=httpx.MockTransport(asaas_handler),
    )
    try:
        with pytest.raises(BillingProviderError) as raised:
            await service._asaas_request("POST", "/payments", json={"value": 2})
        exc = raised.value
        assert exc.status_code == 400
        assert exc.is_client_error is True
        assert exc.error_codes == ["invalid_object"]
        assert exc.user_message is not None
        assert "mínimo permitido" in exc.user_message
        assert exc.path == "/payments"
    finally:
        await service.close()


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
async def test_get_checkout_status_returns_pix_qr_for_pending_payment() -> None:
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
        if request.url.path.endswith("/user_subscriptions"):
            return httpx.Response(
                200,
                request=request,
                json=[
                    {
                        "plan_id": "free",
                        "status": "active",
                        "subscription_source": "asaas",
                        "external_subscription_id": "pay_777",
                        "payment_method": "pix_automatic",
                        "billing_cycle": "monthly",
                    }
                ],
            )
        if request.url.path.endswith("/billing_checkouts"):
            return httpx.Response(
                200,
                request=request,
                json=[
                    {
                        "id": 1,
                        "billing_cycle": "monthly",
                        "external_subscription_id": "pay_777",
                        "payment_method": "pix_automatic",
                        "status": "pending",
                        "created_at": "2026-08-02T12:00:00Z",
                    }
                ],
            )
        return httpx.Response(500, request=request)

    def asaas_handler(request: httpx.Request) -> httpx.Response:
        if request.method == "GET" and request.url.path.endswith("/payments/pay_777"):
            return httpx.Response(200, request=request, json={"id": "pay_777", "status": "PENDING"})
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
        result = await service.get_checkout_status(user_id=user_id)
        assert result["has_pending_checkout"] is True
        assert result["payment_status"] == "pending"
        assert result["pix_qr_code"] == "base64qr"
        assert result["pix_copy_paste"] == "000201010212"
    finally:
        await service.close()


@pytest.mark.asyncio
async def test_get_checkout_status_empty_when_premium_active() -> None:
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
    service.db = httpx.AsyncClient(
        base_url="https://example.supabase.co/rest/v1",
        headers={"apikey": "service-role-key"},
        transport=httpx.MockTransport(
            lambda request: (
                httpx.Response(
                    200,
                    request=request,
                    json=[{"plan_id": "premium", "status": "active"}],
                )
                if request.url.path.endswith("/user_subscriptions")
                else httpx.Response(500, request=request)
            )
        ),
    )
    service.asaas = httpx.AsyncClient(base_url="https://api-sandbox.asaas.com/v3")
    try:
        result = await service.get_checkout_status(user_id=user_id)
        assert result == {"has_pending_checkout": False}
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
        if request.method == "GET" and request.url.path.endswith("/payments/pay_777"):
            return httpx.Response(
                200,
                request=request,
                json={
                    "id": "pay_777",
                    "status": "CONFIRMED",
                    "customer": "cus_123",
                    "externalReference": f"{user_id}:monthly:pix_automatic",
                },
            )
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
async def test_handle_webhook_rejects_unverified_payment_activation() -> None:
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
    service.db = httpx.AsyncClient(
        base_url="https://example.supabase.co/rest/v1",
        headers={"apikey": "service-role-key"},
        transport=httpx.MockTransport(lambda request: httpx.Response(500, request=request)),
    )
    service.asaas = httpx.AsyncClient(
        base_url="https://api-sandbox.asaas.com/v3",
        transport=httpx.MockTransport(
            lambda request: (
                httpx.Response(
                    200,
                    request=request,
                    json={"id": "pay_pending", "status": "PENDING"},
                )
                if request.url.path.endswith("/payments/pay_pending")
                else httpx.Response(404, request=request)
            )
        ),
    )
    try:
        result = await service.handle_webhook(
            {
                "id": "evt_fake",
                "event": "PAYMENT_CONFIRMED",
                "payment": {
                    "id": "pay_pending",
                    "externalReference": f"{user_id}:monthly:pix_automatic",
                },
            }
        )
        assert result["processed"] is False
        assert result["reason"] == "payment_not_confirmed_on_asaas"
    finally:
        await service.close()


@pytest.mark.asyncio
async def test_handle_webhook_processes_payment_overdue() -> None:
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
    service.db = httpx.AsyncClient(
        base_url="https://example.supabase.co/rest/v1",
        headers={"apikey": "service-role-key"},
        transport=httpx.MockTransport(
            lambda request: (
                httpx.Response(
                    200,
                    request=request,
                    json={"updated": True, "subscription_status": "pending"},
                )
                if request.url.path.endswith("/rpc/process_billing_event")
                else httpx.Response(500, request=request)
            )
        ),
    )
    service.asaas = httpx.AsyncClient(base_url="https://api-sandbox.asaas.com/v3")
    try:
        result = await service.handle_webhook(
            {
                "id": "evt_overdue",
                "event": "PAYMENT_OVERDUE",
                "payment": {
                    "id": "pay_overdue",
                    "externalReference": f"{user_id}:monthly:pix_automatic",
                },
            }
        )
        assert result["processed"] is True
        assert result["event"] == "PAYMENT_OVERDUE"
    finally:
        await service.close()


@pytest.mark.asyncio
async def test_handle_webhook_subscription_updated_active_is_recorded_only() -> None:
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
    captured: dict[str, object] = {}

    def db_handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/rpc/process_billing_event"):
            captured["payload"] = json.loads(request.content.decode())
            return httpx.Response(
                200,
                request=request,
                json={"updated": True, "reason": "recorded", "subscription_status": "pending"},
            )
        return httpx.Response(500, request=request)

    service.db = httpx.AsyncClient(
        base_url="https://example.supabase.co/rest/v1",
        headers={"apikey": "service-role-key"},
        transport=httpx.MockTransport(db_handler),
    )
    service.asaas = httpx.AsyncClient(base_url="https://api-sandbox.asaas.com/v3")
    try:
        result = await service.handle_webhook(
            {
                "id": "evt_sub_update",
                "event": "SUBSCRIPTION_UPDATED",
                "subscription": {
                    "id": "sub_123",
                    "status": "ACTIVE",
                    "externalReference": f"{user_id}:annual:card",
                },
            }
        )
        assert result["processed"] is True
        assert result["event"] == "SUBSCRIPTION_UPDATED"
        assert captured["payload"]["p_mp_status"] == "recorded"
    finally:
        await service.close()


@pytest.mark.asyncio
async def test_billing_history_syncs_cancelled_payments_from_asaas() -> None:
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
    patched: list[str] = []

    def db_handler(request: httpx.Request) -> httpx.Response:
        if request.method == "GET" and request.url.path.endswith("/billing_checkouts"):
            if "status=eq.pending" in str(request.url):
                return httpx.Response(
                    200,
                    request=request,
                    json=[
                        {
                            "id": 9,
                            "payment_method": "pix_automatic",
                            "external_subscription_id": "pay_gone",
                        }
                    ],
                )
            return httpx.Response(
                200,
                request=request,
                json=[
                    {
                        "id": 9,
                        "billing_cycle": "monthly",
                        "payment_method": "pix_automatic",
                        "status": "cancelled",
                        "external_subscription_id": "pay_gone",
                        "created_at": "2026-08-02T12:00:00Z",
                        "updated_at": "2026-08-03T12:00:00Z",
                    }
                ],
            )
        if request.method == "PATCH" and request.url.path.endswith("/billing_checkouts"):
            patched.append("pay_gone")
            return httpx.Response(204, request=request)
        if request.url.path.endswith("/user_subscriptions"):
            return httpx.Response(200, request=request, json=[])
        if request.url.path.endswith("/billing_events"):
            return httpx.Response(200, request=request, json=[])
        return httpx.Response(500, request=request)

    service.db = httpx.AsyncClient(
        base_url="https://example.supabase.co/rest/v1",
        headers={"apikey": "service-role-key"},
        transport=httpx.MockTransport(db_handler),
    )
    service.asaas = httpx.AsyncClient(
        base_url="https://api-sandbox.asaas.com/v3",
        transport=httpx.MockTransport(
            lambda request: (
                httpx.Response(404, request=request, text="not found")
                if request.url.path.endswith("/payments/pay_gone")
                else httpx.Response(500, request=request)
            )
        ),
    )
    try:
        result = await service.get_billing_history(user_id=user_id)
        assert patched == ["pay_gone"]
        assert result["checkouts"][0]["status"] == "cancelled"
        assert result["checkouts"][0]["can_resume"] is False
    finally:
        await service.close()


@pytest.mark.asyncio
async def test_abandon_pending_card_checkout_cancels_asaas_and_local() -> None:
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

    patched: list[str] = []
    deleted: list[str] = []

    def db_handler(request: httpx.Request) -> httpx.Response:
        if request.method == "GET" and request.url.path.endswith("/billing_checkouts"):
            return httpx.Response(
                200,
                request=request,
                json=[
                    {
                        "id": 9,
                        "billing_cycle": "annual",
                        "payment_method": "card",
                        "status": "pending",
                        "external_subscription_id": "sub_stuck",
                        "created_at": "2026-08-03T10:00:00Z",
                    }
                ],
            )
        if request.method == "PATCH" and request.url.path.endswith("/billing_checkouts"):
            patched.append(request.content.decode())
            return httpx.Response(204, request=request)
        return httpx.Response(500, request=request)

    def asaas_handler(request: httpx.Request) -> httpx.Response:
        if request.method == "DELETE" and request.url.path.endswith("/subscriptions/sub_stuck"):
            deleted.append(request.url.path)
            return httpx.Response(200, request=request, json={"deleted": True})
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
        result = await service.abandon_pending_checkout(
            user_id=user_id,
            external_subscription_id="sub_stuck",
        )
        assert result["has_pending_checkout"] is False
        assert result["checkout_status"] == "cancelled"
        assert deleted == ["/v3/subscriptions/sub_stuck"]
        assert patched
        assert "cancelled" in patched[0]
    finally:
        await service.close()


@pytest.mark.asyncio
async def test_resume_pending_checkout_returns_pix_qr() -> None:
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
        if request.url.path.endswith("/billing_checkouts"):
            return httpx.Response(
                200,
                request=request,
                json=[
                    {
                        "id": 3,
                        "billing_cycle": "monthly",
                        "payment_method": "pix_automatic",
                        "status": "pending",
                        "external_subscription_id": "pay_live",
                        "created_at": "2026-08-03T10:00:00Z",
                    }
                ],
            )
        return httpx.Response(500, request=request)

    def asaas_handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/payments/pay_live"):
            return httpx.Response(
                200,
                request=request,
                json={"id": "pay_live", "status": "PENDING"},
            )
        if request.url.path.endswith("/pixQrCode"):
            return httpx.Response(
                200,
                request=request,
                json={"encodedImage": "qr", "payload": "pix-copy"},
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
        result = await service.resume_pending_checkout(
            user_id=user_id,
            external_subscription_id="pay_live",
        )
        assert result["has_pending_checkout"] is True
        assert result["pix_qr_code"] == "qr"
        assert result["pix_copy_paste"] == "pix-copy"
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
