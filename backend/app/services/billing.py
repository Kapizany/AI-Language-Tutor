from __future__ import annotations

import hashlib
import hmac
import logging
import re
from datetime import UTC, datetime
from typing import Any, Literal
from uuid import UUID, uuid4

import httpx

from app.core.config import Settings

logger = logging.getLogger(__name__)

BillingCycle = Literal["monthly", "annual"]
MERCADOPAGO_TEST_PAYER_EMAIL = "test@testuser.com"

PRICING: dict[BillingCycle, dict[str, Any]] = {
    "monthly": {
        "amount": 19.90,
        "frequency": 1,
        "frequency_type": "months",
        "reason": "Lume Tutor Premium - Mensal",
    },
    "annual": {
        "amount": 179.10,
        "frequency": 12,
        "frequency_type": "months",
        "reason": "Lume Tutor Premium - Anual",
    },
}


class BillingServiceError(RuntimeError):
    pass


class BillingNotConfiguredError(BillingServiceError):
    pass


class BillingRateLimitError(BillingServiceError):
    def __init__(self, message: str, *, retry_after_seconds: int | None = None) -> None:
        super().__init__(message)
        self.retry_after_seconds = retry_after_seconds


class AlreadyPremiumError(BillingServiceError):
    pass


MP_SIMULATION_PREAPPROVAL_IDS = frozenset({"123456", "12345"})


def parse_mercadopago_webhook_payload(
    body: dict[str, Any] | None,
    *,
    query_resource_id: str | None = None,
    query_topic: str | None = None,
) -> tuple[str | None, str | None, dict[str, Any] | None]:
    payload = body if body else None
    resource_id = query_resource_id
    topic = query_topic

    if payload:
        data = payload.get("data")
        if not resource_id and isinstance(data, dict) and data.get("id") is not None:
            resource_id = str(data["id"])
        if not resource_id and payload.get("id") is not None:
            resource_id = str(payload["id"])
        if not topic:
            topic = (
                str(payload.get("type") or payload.get("topic") or payload.get("entity") or "")
                or None
            )

    return resource_id, topic, payload


def is_mercadopago_simulation_webhook(
    *,
    resource_id: str | None,
    payload: dict[str, Any] | None,
) -> bool:
    if resource_id and resource_id in MP_SIMULATION_PREAPPROVAL_IDS:
        return True
    if payload and payload.get("live_mode") is False:
        return True
    return False


class BillingService:
    def __init__(self, settings: Settings) -> None:
        self.enabled = bool(
            settings.mercadopago_billing_enabled
            and settings.supabase_url
            and settings.supabase_service_role_key
            and settings.mercadopago_access_token
        )
        self.mock_checkout = settings.mercadopago_mock_checkout
        self.test_checkout = settings.mercadopago_test_checkout
        self.access_token = settings.mercadopago_access_token.strip()
        self.webhook_secret = settings.mercadopago_webhook_secret.strip()
        self.notification_url = settings.mercadopago_notification_url
        self.back_url = settings.mercadopago_back_url
        self.manage_url = settings.mercadopago_manage_url
        self.db = httpx.AsyncClient(
            base_url=(
                f"{settings.supabase_url.rstrip('/')}/rest/v1"
                if settings.supabase_url
                else "http://localhost"
            ),
            timeout=15,
            headers={
                "apikey": settings.supabase_service_role_key,
                "Authorization": f"Bearer {settings.supabase_service_role_key}",
                "Content-Type": "application/json",
            },
        )
        self.mp = httpx.AsyncClient(
            base_url="https://api.mercadopago.com",
            timeout=20,
            headers={
                "Authorization": f"Bearer {self.access_token}",
                "Content-Type": "application/json",
            },
        )
        logger.info(
            "Billing service initialized",
            extra={
                "operation": "billing_initialize",
                "billing_enabled": self.enabled,
                "mock_checkout": self.mock_checkout,
                "test_checkout": self.test_checkout,
            },
        )

    @property
    def webhooks_ready(self) -> bool:
        return bool(self.db.headers.get("apikey") and self.access_token)

    def _checkout_payer_email(self, user_email: str | None) -> str | None:
        if self.test_checkout:
            return MERCADOPAGO_TEST_PAYER_EMAIL
        return user_email

    async def close(self) -> None:
        await self.db.aclose()
        await self.mp.aclose()

    async def _rpc(self, name: str, payload: dict[str, Any]) -> Any:
        if not self.db.headers.get("apikey"):
            raise BillingNotConfiguredError("Billing database is not configured")
        try:
            response = await self.db.post(f"/rpc/{name}", json=payload)
        except httpx.HTTPError as exc:
            logger.exception(
                "Billing RPC transport failed",
                extra={
                    "operation": "billing_rpc",
                    "provider": "supabase",
                    "rpc": name,
                    "error_type": type(exc).__name__,
                },
            )
            raise BillingServiceError(f"Billing RPC {name} transport failed") from exc
        if response.status_code >= 400:
            logger.error(
                "Billing RPC rejected",
                extra={
                    "operation": "billing_rpc",
                    "provider": "supabase",
                    "rpc": name,
                    "http_status": response.status_code,
                },
            )
            raise BillingServiceError(f"Billing RPC {name} failed: {response.text}")
        try:
            return response.json()
        except ValueError as exc:
            logger.exception(
                "Billing RPC returned invalid JSON",
                extra={
                    "operation": "billing_rpc",
                    "provider": "supabase",
                    "rpc": name,
                    "http_status": response.status_code,
                    "error_type": type(exc).__name__,
                },
            )
            raise BillingServiceError(f"Billing RPC {name} returned invalid JSON") from exc

    async def create_checkout(
        self,
        *,
        user_id: UUID,
        user_email: str | None,
        billing_cycle: BillingCycle,
    ) -> dict[str, str]:
        logger.info(
            "Checkout creation started",
            extra={
                "operation": "checkout_create",
                "provider": "mercadopago",
                "billing_cycle": billing_cycle,
                "mock_checkout": self.mock_checkout,
                "test_checkout": self.test_checkout,
            },
        )
        if self.mock_checkout:
            external_id = f"mock:{user_id}:{billing_cycle}"
            await self._rpc(
                "create_billing_checkout",
                {
                    "p_user_id": str(user_id),
                    "p_billing_cycle": billing_cycle,
                    "p_external_subscription_id": external_id,
                },
            )
            logger.info(
                "Mock checkout created",
                extra={
                    "operation": "checkout_create",
                    "provider": "mock",
                    "billing_cycle": billing_cycle,
                },
            )
            return {
                "checkout_url": f"{self.back_url}?mock=1&cycle={billing_cycle}",
                "external_subscription_id": external_id,
            }

        if not self.enabled:
            logger.error(
                "Checkout requested while billing is disabled",
                extra={
                    "operation": "checkout_create",
                    "provider": "mercadopago",
                    "billing_cycle": billing_cycle,
                    "billing_enabled": self.enabled,
                },
            )
            raise BillingNotConfiguredError("Mercado Pago billing is not configured")

        reservation = await self._rpc(
            "reserve_billing_checkout_attempt",
            {"p_user_id": str(user_id)},
        )
        if not isinstance(reservation, dict) or not reservation.get("allowed"):
            reason = reservation.get("reason") if isinstance(reservation, dict) else None
            logger.warning(
                "Checkout reservation rejected",
                extra={
                    "operation": "checkout_reserve",
                    "provider": "supabase",
                    "billing_cycle": billing_cycle,
                    "reason": reason or "invalid_response",
                },
            )
            if reason == "already_premium":
                raise AlreadyPremiumError("User already has an active premium subscription")
            retry_after = None
            if isinstance(reservation, dict):
                raw_retry = reservation.get("retry_after_seconds")
                if isinstance(raw_retry, int):
                    retry_after = raw_retry
                elif isinstance(raw_retry, str) and raw_retry.isdigit():
                    retry_after = int(raw_retry)
            raise BillingRateLimitError(
                "Too many checkout attempts",
                retry_after_seconds=retry_after,
            )

        pricing = PRICING[billing_cycle]
        payload: dict[str, Any] = {
            "reason": pricing["reason"],
            "external_reference": f"{user_id}:{billing_cycle}",
            "auto_recurring": {
                "frequency": pricing["frequency"],
                "frequency_type": pricing["frequency_type"],
                "transaction_amount": pricing["amount"],
                "currency_id": "BRL",
            },
            "back_url": self.back_url,
            "status": "pending",
        }
        payer_email = self._checkout_payer_email(user_email)
        if payer_email:
            payload["payer_email"] = payer_email
        if self.notification_url:
            payload["notification_url"] = self.notification_url

        try:
            response = await self.mp.post(
                "/preapproval",
                json=payload,
                headers={"X-Idempotency-Key": str(uuid4())},
            )
        except httpx.HTTPError as exc:
            logger.exception(
                "Mercado Pago checkout transport failed",
                extra={
                    "operation": "checkout_create",
                    "provider": "mercadopago",
                    "billing_cycle": billing_cycle,
                    "error_type": type(exc).__name__,
                    "test_checkout": self.test_checkout,
                },
            )
            await self._release_checkout_attempt(user_id)
            raise BillingServiceError("Mercado Pago checkout transport failed") from exc

        if response.status_code >= 400:
            logger.warning(
                "Mercado Pago preapproval rejected checkout status=%s body=%s",
                response.status_code,
                response.text[:500],
                extra={
                    "operation": "checkout_create",
                    "provider": "mercadopago",
                    "billing_cycle": billing_cycle,
                    "http_status": response.status_code,
                    "test_checkout": self.test_checkout,
                },
            )
            await self._release_checkout_attempt(user_id)
            raise BillingServiceError(f"Mercado Pago checkout failed: {response.text}")

        try:
            body = response.json()
        except ValueError as exc:
            logger.exception(
                "Mercado Pago checkout returned invalid JSON",
                extra={
                    "operation": "checkout_create",
                    "provider": "mercadopago",
                    "billing_cycle": billing_cycle,
                    "http_status": response.status_code,
                    "error_type": type(exc).__name__,
                },
            )
            await self._release_checkout_attempt(user_id)
            raise BillingServiceError("Mercado Pago checkout returned invalid JSON") from exc

        if not isinstance(body, dict):
            logger.error(
                "Mercado Pago checkout returned an unexpected payload",
                extra={
                    "operation": "checkout_create",
                    "provider": "mercadopago",
                    "billing_cycle": billing_cycle,
                    "http_status": response.status_code,
                },
            )
            await self._release_checkout_attempt(user_id)
            raise BillingServiceError("Mercado Pago checkout returned an unexpected payload")

        checkout_url = body.get("init_point") or body.get("sandbox_init_point")
        preapproval_id = body.get("id")
        if not checkout_url or not preapproval_id:
            logger.error(
                "Mercado Pago checkout response is incomplete",
                extra={
                    "operation": "checkout_create",
                    "provider": "mercadopago",
                    "billing_cycle": billing_cycle,
                    "http_status": response.status_code,
                    "reason": "missing_init_point_or_id",
                },
            )
            await self._release_checkout_attempt(user_id)
            raise BillingServiceError("Mercado Pago checkout returned an incomplete payload")

        try:
            await self._rpc(
                "create_billing_checkout",
                {
                    "p_user_id": str(user_id),
                    "p_billing_cycle": billing_cycle,
                    "p_external_subscription_id": str(preapproval_id),
                },
            )
        except BillingServiceError:
            await self._release_checkout_attempt(user_id)
            raise

        logger.info(
            "Checkout created successfully",
            extra={
                "operation": "checkout_create",
                "provider": "mercadopago",
                "billing_cycle": billing_cycle,
                "http_status": response.status_code,
                "test_checkout": self.test_checkout,
            },
        )
        return {
            "checkout_url": str(checkout_url),
            "external_subscription_id": str(preapproval_id),
        }

    async def _release_checkout_attempt(self, user_id: UUID) -> None:
        try:
            await self._rpc(
                "release_billing_checkout_attempt",
                {"p_user_id": str(user_id)},
            )
        except BillingServiceError as exc:
            logger.exception(
                "Could not release failed checkout attempt",
                extra={
                    "operation": "checkout_release",
                    "provider": "supabase",
                    "error_type": type(exc).__name__,
                },
            )
            return

    async def fetch_preapproval(self, preapproval_id: str) -> dict[str, Any]:
        if self.mock_checkout and preapproval_id.startswith("mock:"):
            _, user_part, cycle = preapproval_id.split(":", 2)
            return {
                "id": preapproval_id,
                "status": "authorized",
                "payer_id": "mock-payer",
                "external_reference": f"{user_part}:{cycle}",
                "next_payment_date": None,
            }

        if not self.webhooks_ready:
            raise BillingNotConfiguredError("Mercado Pago billing is not configured")

        try:
            response = await self.mp.get(f"/preapproval/{preapproval_id}")
        except httpx.HTTPError as exc:
            logger.exception(
                "Mercado Pago preapproval lookup transport failed",
                extra={
                    "operation": "preapproval_lookup",
                    "provider": "mercadopago",
                    "error_type": type(exc).__name__,
                },
            )
            raise BillingServiceError("Mercado Pago lookup transport failed") from exc
        if response.status_code == 404:
            logger.warning(
                "Mercado Pago preapproval was not found",
                extra={
                    "operation": "preapproval_lookup",
                    "provider": "mercadopago",
                    "http_status": response.status_code,
                },
            )
            raise BillingServiceError(f"Preapproval {preapproval_id} was not found")
        if response.status_code >= 400:
            logger.error(
                "Mercado Pago preapproval lookup failed",
                extra={
                    "operation": "preapproval_lookup",
                    "provider": "mercadopago",
                    "http_status": response.status_code,
                },
            )
            raise BillingServiceError(f"Mercado Pago lookup failed: {response.text}")
        try:
            body = response.json()
        except ValueError as exc:
            logger.exception(
                "Mercado Pago preapproval lookup returned invalid JSON",
                extra={
                    "operation": "preapproval_lookup",
                    "provider": "mercadopago",
                    "http_status": response.status_code,
                    "error_type": type(exc).__name__,
                },
            )
            raise BillingServiceError("Mercado Pago lookup returned invalid JSON") from exc
        if not isinstance(body, dict):
            raise BillingServiceError("Mercado Pago lookup returned invalid payload")
        return body

    async def refresh_user_subscription(self, *, user_id: UUID) -> dict[str, Any]:
        reservation = await self._rpc(
            "reserve_billing_refresh_attempt",
            {"p_user_id": str(user_id)},
        )
        if not isinstance(reservation, dict) or not reservation.get("allowed"):
            logger.warning(
                "Subscription refresh reservation rejected",
                extra={
                    "operation": "subscription_refresh",
                    "provider": "supabase",
                    "reason": (
                        str(reservation.get("reason"))
                        if isinstance(reservation, dict)
                        else "invalid_response"
                    ),
                },
            )
            raise BillingRateLimitError("Too many subscription refresh attempts")

        try:
            response = await self.db.get(
                "/billing_checkouts",
                params={
                    "user_id": f"eq.{user_id}",
                    "order": "created_at.desc",
                    "limit": "1",
                },
            )
        except httpx.HTTPError as exc:
            logger.exception(
                "Could not load pending billing checkout",
                extra={
                    "operation": "subscription_refresh",
                    "provider": "supabase",
                    "error_type": type(exc).__name__,
                },
            )
            raise BillingServiceError("Could not load pending billing checkout") from exc
        if response.status_code >= 400:
            logger.error(
                "Supabase rejected pending checkout lookup",
                extra={
                    "operation": "subscription_refresh",
                    "provider": "supabase",
                    "http_status": response.status_code,
                },
            )
            raise BillingServiceError("Could not load pending billing checkout")

        try:
            rows = response.json()
        except ValueError as exc:
            logger.exception(
                "Pending checkout lookup returned invalid JSON",
                extra={
                    "operation": "subscription_refresh",
                    "provider": "supabase",
                    "http_status": response.status_code,
                    "error_type": type(exc).__name__,
                },
            )
            raise BillingServiceError("Could not parse pending billing checkout") from exc
        if not isinstance(rows, list) or not rows:
            return {"updated": False, "reason": "checkout_not_found"}

        checkout = rows[0]
        preapproval_id = checkout.get("external_subscription_id")
        billing_cycle = checkout.get("billing_cycle")
        if not preapproval_id:
            return {"updated": False, "reason": "checkout_not_found"}

        return await self.sync_preapproval(
            preapproval_id=str(preapproval_id),
            billing_cycle=str(billing_cycle) if billing_cycle else None,
            fallback_user_id=user_id,
        )

    async def sync_preapproval(
        self,
        *,
        preapproval_id: str,
        billing_cycle: str | None = None,
        fallback_user_id: UUID | None = None,
    ) -> dict[str, Any]:
        if not self.webhooks_ready:
            return {"processed": False, "reason": "billing_not_configured"}

        preapproval = await self.fetch_preapproval(preapproval_id)
        user_id, parsed_cycle = self._parse_external_reference(
            str(preapproval.get("external_reference") or ""),
            fallback_user_id=fallback_user_id,
        )
        resolved_cycle = billing_cycle or parsed_cycle
        ends_at = self._resolve_grace_end(preapproval)
        payer_id = preapproval.get("payer_id")

        event_key = f"{preapproval_id}:{preapproval.get('status')}:{ends_at}"
        event_payload = {
            "preapproval_id": preapproval_id,
            "status": str(preapproval.get("status") or ""),
            "date_created": preapproval.get("date_created"),
            "last_modified": preapproval.get("last_modified"),
        }
        result = await self._rpc(
            "process_billing_event",
            {
                "p_provider": "mercadopago",
                "p_event_key": event_key,
                "p_payload": event_payload,
                "p_user_id": str(user_id),
                "p_external_subscription_id": preapproval_id,
                "p_external_customer_id": str(payer_id) if payer_id is not None else None,
                "p_mp_status": str(preapproval.get("status") or ""),
                "p_billing_cycle": resolved_cycle,
                "p_ends_at": ends_at.isoformat() if ends_at else None,
            },
        )
        return result if isinstance(result, dict) else {"updated": False}

    def verify_webhook_signature(
        self,
        *,
        resource_id: str | None,
        request_id: str | None,
        signature: str | None,
    ) -> bool:
        if self.mock_checkout:
            return True
        if not self.webhook_secret or not resource_id or not request_id or not signature:
            return False

        parts = {
            match.group(1): match.group(2)
            for match in re.finditer(r"(?:^|,)\s*(ts|v1)=([^,\s]+)", signature)
        }
        timestamp = parts.get("ts")
        received_digest = parts.get("v1")
        if not timestamp or not received_digest:
            return False

        manifest = f"id:{resource_id.lower()};request-id:{request_id};ts:{timestamp};"
        expected_digest = hmac.new(
            self.webhook_secret.encode(),
            manifest.encode(),
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(expected_digest, received_digest)

    async def handle_notification(
        self,
        *,
        resource_id: str | None,
        topic: str | None,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if is_mercadopago_simulation_webhook(resource_id=resource_id, payload=payload):
            return {
                "processed": True,
                "simulation": True,
                "reason": "simulation_acknowledged",
            }

        if not resource_id:
            return {"processed": False, "reason": "missing_resource_id"}

        if topic and topic not in {
            "subscription_preapproval",
            "preapproval",
            "subscription_authorized_payment",
        }:
            return {"processed": False, "reason": "ignored_topic"}

        if not self.webhooks_ready:
            return {"processed": False, "reason": "billing_not_configured"}

        try:
            return await self.sync_preapproval(preapproval_id=resource_id)
        except BillingServiceError as exc:
            message = str(exc)
            if "was not found" in message:
                logger.warning(
                    "Webhook referenced a missing preapproval",
                    extra={
                        "operation": "webhook_process",
                        "provider": "mercadopago",
                        "reason": "preapproval_not_found",
                    },
                )
                return {"processed": False, "reason": "preapproval_not_found"}
            logger.exception(
                "Webhook subscription synchronization failed",
                extra={
                    "operation": "webhook_process",
                    "provider": "mercadopago",
                    "error_type": type(exc).__name__,
                },
            )
            return {"processed": False, "reason": "sync_failed", "detail": message}

    def _parse_external_reference(
        self,
        external_reference: str,
        *,
        fallback_user_id: UUID | None,
    ) -> tuple[UUID, str | None]:
        if external_reference:
            user_part, _, cycle = external_reference.partition(":")
            try:
                return UUID(user_part), cycle or None
            except ValueError:
                pass

        if fallback_user_id is not None:
            return fallback_user_id, None

        raise BillingServiceError("Could not resolve billing user from external reference")

    @staticmethod
    def _resolve_grace_end(preapproval: dict[str, Any]) -> datetime | None:
        status = str(preapproval.get("status") or "").lower()
        if status not in {"cancelled", "canceled", "paused"}:
            return None

        for key in ("next_payment_date",):
            raw = preapproval.get(key)
            if not raw:
                continue
            try:
                parsed = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
            except ValueError:
                continue
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=UTC)
            return parsed

        return datetime.now(tz=UTC)
