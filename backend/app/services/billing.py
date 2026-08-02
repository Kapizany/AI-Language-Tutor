from __future__ import annotations

import hashlib
import hmac
import logging
import re
from datetime import UTC, datetime
from typing import Any, Literal
from urllib.parse import urlsplit, urlunsplit
from uuid import NAMESPACE_URL, UUID, uuid5

import httpx

from app.core.config import Settings

logger = logging.getLogger(__name__)

BillingCycle = Literal["monthly", "annual"]
MERCADOPAGO_TEST_PAYER_EMAIL = "test@testuser.com"

PRICING: dict[BillingCycle, dict[str, Any]] = {
    "monthly": {
        "amount": 5.00,
        "frequency": 1,
        "frequency_type": "months",
        "reason": "Lume Tutor Premium - Mensal",
    },
    "annual": {
        "amount": 5.00,
        "frequency": 12,
        "frequency_type": "months",
        "reason": "Lume Tutor Premium - Anual",
    },
}


class BillingServiceError(RuntimeError):
    pass


class BillingNotConfiguredError(BillingServiceError):
    pass


class BillingCredentialMismatchError(BillingNotConfiguredError):
    pass


class BillingProviderError(BillingServiceError):
    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        request_id: str | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.request_id = request_id


class BillingSubscriptionNotFoundError(BillingServiceError):
    pass


class BillingSubscriptionNotCancelableError(BillingServiceError):
    pass


class BillingSellerIsBuyerError(BillingServiceError):
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
        self.public_key = settings.mercadopago_public_key.strip()
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
        return bool(self.db.headers.get("apikey") and (self.access_token or self.mock_checkout))

    def _checkout_payer_email(self, user_email: str | None) -> str | None:
        if self.test_checkout:
            return MERCADOPAGO_TEST_PAYER_EMAIL
        return user_email

    def _assert_matching_credentials(self) -> None:
        if self.mock_checkout or not self.enabled:
            return
        public_is_test = self.public_key.startswith("TEST-")
        token_is_test = self.access_token.startswith("TEST-")
        if public_is_test != token_is_test:
            raise BillingCredentialMismatchError(
                "Mercado Pago public key and access token are from different environments"
            )

    @staticmethod
    def _subscription_idempotency_key(
        *,
        user_id: UUID,
        billing_cycle: BillingCycle,
        card_token_id: str,
    ) -> str:
        """Keep retries for the same one-time card token idempotent."""
        return str(
            uuid5(
                NAMESPACE_URL,
                f"lume:mercadopago:preapproval:{user_id}:{billing_cycle}:{card_token_id}",
            )
        )

    def _preapproval_back_url(self) -> str:
        """Mercado Pago rejects or fails on SPA fragment URLs like .../#/billing/success."""
        raw = (self.back_url or "").strip()
        if not raw:
            return "https://www.mercadopago.com.br"
        parts = urlsplit(raw)
        path = parts.path or "/"
        return urlunsplit((parts.scheme, parts.netloc, path, "", ""))

    async def _collector_email(self) -> str | None:
        try:
            response = await self.mp.get("/users/me")
        except httpx.HTTPError:
            return None
        if response.status_code >= 400:
            return None
        try:
            body = response.json()
        except ValueError:
            return None
        if not isinstance(body, dict):
            return None
        email = body.get("email")
        return str(email).strip().lower() if email else None

    async def _assert_payer_is_not_collector(self, payer_email: str) -> None:
        collector_email = await self._collector_email()
        if collector_email and collector_email == payer_email.strip().lower():
            raise BillingSellerIsBuyerError("Payer email matches the Mercado Pago seller account")

    async def _validate_card_token(self, card_token_id: str) -> None:
        try:
            response = await self.mp.get(f"/v1/card_tokens/{card_token_id}")
        except httpx.HTTPError as exc:
            raise BillingProviderError(
                "Mercado Pago card-token validation transport failed"
            ) from exc

        request_id = response.headers.get("x-request-id")
        if response.status_code == 404:
            raise BillingCredentialMismatchError(
                "Mercado Pago could not access the card token with the configured access token"
            )
        if response.status_code >= 400:
            raise BillingProviderError(
                "Mercado Pago rejected card-token validation",
                status_code=response.status_code,
                request_id=request_id,
            )

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
        if response.status_code == 204 or not response.content:
            return None
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

    async def create_checkout_session(
        self,
        *,
        user_id: UUID,
        user_email: str | None,
        billing_cycle: BillingCycle,
    ) -> dict[str, Any]:
        logger.info(
            "Checkout session creation started",
            extra={
                "operation": "checkout_session",
                "provider": "mercadopago",
                "billing_cycle": billing_cycle,
                "mock_checkout": self.mock_checkout,
            },
        )
        if not self.mock_checkout and not self.enabled:
            raise BillingNotConfiguredError("Mercado Pago billing is not configured")
        if not self.mock_checkout and not self.public_key:
            raise BillingNotConfiguredError("Mercado Pago public key is not configured")
        self._assert_matching_credentials()

        await self._assert_can_start_checkout(user_id=user_id)

        pricing = PRICING[billing_cycle]
        return {
            "public_key": self.public_key or "TEST-public-key",
            "amount": float(pricing["amount"]),
            "currency": "BRL",
            "billing_cycle": billing_cycle,
            "reason": str(pricing["reason"]),
            "payer_email": self._checkout_payer_email(user_email),
            "mock_checkout": self.mock_checkout,
        }

    async def create_subscription_with_card_token(
        self,
        *,
        user_id: UUID,
        user_email: str | None,
        billing_cycle: BillingCycle,
        card_token_id: str,
    ) -> dict[str, Any]:
        logger.info(
            "Card-token subscription creation started",
            extra={
                "operation": "subscribe_card_token",
                "provider": "mercadopago",
                "billing_cycle": billing_cycle,
                "mock_checkout": self.mock_checkout,
                "test_checkout": self.test_checkout,
            },
        )
        token = card_token_id.strip()
        if not token:
            raise BillingServiceError("Card token is required")

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
            result = await self.sync_preapproval(
                preapproval_id=external_id,
                billing_cycle=billing_cycle,
                fallback_user_id=user_id,
            )
            return {
                "plan_id": str(result.get("plan_id") or "premium"),
                "subscription_status": str(result.get("subscription_status") or "active"),
                "external_subscription_id": external_id,
                "billing_cycle": billing_cycle,
            }

        if not self.enabled:
            raise BillingNotConfiguredError("Mercado Pago billing is not configured")
        self._assert_matching_credentials()

        reservation = await self._rpc(
            "reserve_billing_checkout_attempt",
            {"p_user_id": str(user_id)},
        )
        if not isinstance(reservation, dict) or not reservation.get("allowed"):
            reason = reservation.get("reason") if isinstance(reservation, dict) else None
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

        try:
            await self._validate_card_token(token)
        except BillingServiceError:
            await self._release_checkout_attempt(user_id)
            raise

        pricing = PRICING[billing_cycle]
        payer_email = self._checkout_payer_email(user_email)
        if not payer_email:
            await self._release_checkout_attempt(user_id)
            raise BillingServiceError("Authenticated user email is required for subscription")

        try:
            await self._assert_payer_is_not_collector(payer_email)
        except BillingSellerIsBuyerError:
            await self._release_checkout_attempt(user_id)
            raise

        back_url = self._preapproval_back_url()
        payload: dict[str, Any] = {
            "reason": pricing["reason"],
            "external_reference": f"{user_id}:{billing_cycle}",
            "payer_email": payer_email,
            "card_token_id": token,
            "auto_recurring": {
                "frequency": pricing["frequency"],
                "frequency_type": pricing["frequency_type"],
                "transaction_amount": pricing["amount"],
                "currency_id": "BRL",
            },
            "back_url": back_url,
            "status": "authorized",
        }
        if self.notification_url:
            payload["notification_url"] = self.notification_url

        logger.info(
            "Mercado Pago preapproval subscribe payload prepared",
            extra={
                "operation": "subscribe_card_token",
                "provider": "mercadopago",
                "billing_cycle": billing_cycle,
                "frequency": pricing["frequency"],
                "amount": pricing["amount"],
                "back_url_host": urlsplit(back_url).netloc,
            },
        )

        try:
            response = await self.mp.post(
                "/preapproval",
                json=payload,
                headers={
                    "X-Idempotency-Key": self._subscription_idempotency_key(
                        user_id=user_id,
                        billing_cycle=billing_cycle,
                        card_token_id=token,
                    )
                },
            )
        except httpx.HTTPError as exc:
            logger.exception(
                "Mercado Pago subscribe transport failed",
                extra={
                    "operation": "subscribe_card_token",
                    "provider": "mercadopago",
                    "billing_cycle": billing_cycle,
                    "error_type": type(exc).__name__,
                },
            )
            await self._release_checkout_attempt(user_id)
            raise BillingServiceError("Mercado Pago subscribe transport failed") from exc

        if response.status_code >= 400:
            logger.warning(
                "Mercado Pago preapproval rejected subscribe status=%s body=%s",
                response.status_code,
                response.text[:500],
                extra={
                    "operation": "subscribe_card_token",
                    "provider": "mercadopago",
                    "billing_cycle": billing_cycle,
                    "http_status": response.status_code,
                    "upstream_request_id": response.headers.get("x-request-id"),
                },
            )
            await self._release_checkout_attempt(user_id)
            if "Card token service not found" in response.text:
                raise BillingCredentialMismatchError(
                    "Mercado Pago rejected the card token because public key and "
                    "access token are from different environments"
                )
            if "Both payer and collector must be real or test users" in response.text:
                raise BillingServiceError(
                    "Mercado Pago rejected the payer/collector pairing. "
                    "Use a buyer email/card that is not the seller account."
                )
            if response.status_code >= 500:
                raise BillingProviderError(
                    "Mercado Pago subscription service failed",
                    status_code=response.status_code,
                    request_id=response.headers.get("x-request-id"),
                )
            raise BillingServiceError(f"Mercado Pago subscribe failed: {response.text}")

        try:
            body = response.json()
        except ValueError as exc:
            await self._release_checkout_attempt(user_id)
            raise BillingServiceError("Mercado Pago subscribe returned invalid JSON") from exc

        if not isinstance(body, dict) or not body.get("id"):
            await self._release_checkout_attempt(user_id)
            raise BillingServiceError("Mercado Pago subscribe returned an incomplete payload")

        preapproval_id = str(body["id"])
        try:
            await self._rpc(
                "create_billing_checkout",
                {
                    "p_user_id": str(user_id),
                    "p_billing_cycle": billing_cycle,
                    "p_external_subscription_id": preapproval_id,
                },
            )
        except BillingServiceError:
            await self._release_checkout_attempt(user_id)
            raise

        result = await self.sync_preapproval(
            preapproval_id=preapproval_id,
            billing_cycle=billing_cycle,
            fallback_user_id=user_id,
        )
        logger.info(
            "Card-token subscription created successfully",
            extra={
                "operation": "subscribe_card_token",
                "provider": "mercadopago",
                "billing_cycle": billing_cycle,
                "http_status": response.status_code,
            },
        )
        return {
            "plan_id": str(result.get("plan_id") or "premium"),
            "subscription_status": str(result.get("subscription_status") or "active"),
            "external_subscription_id": preapproval_id,
            "billing_cycle": billing_cycle,
        }

    async def _load_user_subscription(self, user_id: UUID) -> dict[str, Any] | None:
        try:
            response = await self.db.get(
                "/user_subscriptions",
                params={
                    "user_id": f"eq.{user_id}",
                    "select": (
                        "plan_id,status,started_at,ends_at,renews_at,billing_cycle,"
                        "subscription_source,external_subscription_id"
                    ),
                    "limit": "1",
                },
            )
        except httpx.HTTPError as exc:
            raise BillingServiceError("Could not load billing subscription") from exc
        if response.status_code >= 400:
            raise BillingServiceError("Could not load billing subscription")
        try:
            rows = response.json()
        except ValueError as exc:
            raise BillingServiceError("Could not parse billing subscription") from exc
        if not isinstance(rows, list) or not rows or not isinstance(rows[0], dict):
            return None
        return rows[0]

    async def cancel_subscription(self, *, user_id: UUID) -> dict[str, Any]:
        if not self.enabled:
            raise BillingNotConfiguredError("Mercado Pago billing is not configured")

        subscription = await self._load_user_subscription(user_id)
        if not subscription:
            raise BillingSubscriptionNotFoundError("Subscription was not found")
        if subscription.get("subscription_source") != "mercadopago":
            raise BillingSubscriptionNotCancelableError(
                "Only Mercado Pago subscriptions can be canceled by the user"
            )

        preapproval_id = str(subscription.get("external_subscription_id") or "").strip()
        if not preapproval_id:
            raise BillingSubscriptionNotFoundError("External subscription was not found")

        if str(subscription.get("status") or "").lower() == "canceled":
            return {
                "subscription_status": "canceled",
                "subscription_ends_at": subscription.get("ends_at"),
                "external_subscription_id": preapproval_id,
            }

        current = await self.fetch_preapproval(preapproval_id)
        owner_id, _ = self._parse_external_reference(
            str(current.get("external_reference") or ""),
            fallback_user_id=None,
        )
        if owner_id != user_id:
            raise BillingSubscriptionNotCancelableError(
                "Subscription does not belong to the authenticated user"
            )
        grace_end = self._parse_provider_datetime(current.get("next_payment_date"))

        try:
            response = await self.mp.put(
                f"/preapproval/{preapproval_id}",
                json={"status": "cancelled"},
            )
        except httpx.HTTPError as exc:
            raise BillingProviderError("Mercado Pago cancellation transport failed") from exc

        if response.status_code >= 400:
            raise BillingProviderError(
                "Mercado Pago subscription cancellation failed",
                status_code=response.status_code,
                request_id=response.headers.get("x-request-id"),
            )

        result = await self.sync_preapproval(
            preapproval_id=preapproval_id,
            fallback_user_id=user_id,
            fallback_ends_at=grace_end,
        )
        return {
            "subscription_status": str(result.get("subscription_status") or "canceled"),
            "subscription_ends_at": result.get("ends_at"),
            "external_subscription_id": preapproval_id,
        }

    async def _assert_can_start_checkout(self, *, user_id: UUID) -> None:
        reservation = await self._rpc(
            "reserve_billing_checkout_attempt",
            {"p_user_id": str(user_id)},
        )
        if not isinstance(reservation, dict) or not reservation.get("allowed"):
            reason = reservation.get("reason") if isinstance(reservation, dict) else None
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
        # Session only probes eligibility; release so subscribe can reserve again.
        await self._release_checkout_attempt(user_id)

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

    async def fetch_authorized_payment(self, authorized_payment_id: str) -> dict[str, Any]:
        if not self.webhooks_ready or self.mock_checkout:
            raise BillingNotConfiguredError("Mercado Pago billing is not configured")

        try:
            response = await self.mp.get(f"/authorized_payments/{authorized_payment_id}")
        except httpx.HTTPError as exc:
            logger.exception(
                "Mercado Pago authorized payment lookup transport failed",
                extra={
                    "operation": "authorized_payment_lookup",
                    "provider": "mercadopago",
                    "error_type": type(exc).__name__,
                },
            )
            raise BillingServiceError(
                "Mercado Pago authorized payment lookup transport failed"
            ) from exc
        if response.status_code == 404:
            logger.warning(
                "Mercado Pago authorized payment was not found",
                extra={
                    "operation": "authorized_payment_lookup",
                    "provider": "mercadopago",
                    "http_status": response.status_code,
                },
            )
            raise BillingServiceError(f"Authorized payment {authorized_payment_id} was not found")
        if response.status_code >= 400:
            logger.error(
                "Mercado Pago authorized payment lookup failed",
                extra={
                    "operation": "authorized_payment_lookup",
                    "provider": "mercadopago",
                    "http_status": response.status_code,
                },
            )
            raise BillingServiceError(
                f"Mercado Pago authorized payment lookup failed: {response.text}"
            )
        try:
            body = response.json()
        except ValueError as exc:
            logger.exception(
                "Mercado Pago authorized payment lookup returned invalid JSON",
                extra={
                    "operation": "authorized_payment_lookup",
                    "provider": "mercadopago",
                    "http_status": response.status_code,
                    "error_type": type(exc).__name__,
                },
            )
            raise BillingServiceError(
                "Mercado Pago authorized payment lookup returned invalid JSON"
            ) from exc
        if not isinstance(body, dict):
            raise BillingServiceError(
                "Mercado Pago authorized payment lookup returned invalid payload"
            )
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
        fallback_ends_at: datetime | None = None,
    ) -> dict[str, Any]:
        if not self.webhooks_ready:
            return {"processed": False, "reason": "billing_not_configured"}

        preapproval = await self.fetch_preapproval(preapproval_id)
        user_id, parsed_cycle = self._parse_external_reference(
            str(preapproval.get("external_reference") or ""),
            fallback_user_id=fallback_user_id,
        )
        resolved_cycle = billing_cycle or parsed_cycle
        ends_at = self._resolve_grace_end(preapproval) or fallback_ends_at
        if ends_at is None and str(preapproval.get("status") or "").lower() in {
            "cancelled",
            "canceled",
            "paused",
        }:
            ends_at = datetime.now(tz=UTC)
        payer_id = preapproval.get("payer_id")

        event_version = (
            preapproval.get("last_modified")
            or preapproval.get("next_payment_date")
            or ends_at
            or preapproval.get("date_created")
        )
        event_key = f"{preapproval_id}:{preapproval.get('status')}:{event_version}"
        event_payload = {
            "preapproval_id": preapproval_id,
            "status": str(preapproval.get("status") or ""),
            "date_created": preapproval.get("date_created"),
            "last_modified": preapproval.get("last_modified"),
            "next_payment_date": preapproval.get("next_payment_date"),
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

        preapproval_id = resource_id
        try:
            if topic == "subscription_authorized_payment":
                authorized_payment = await self.fetch_authorized_payment(resource_id)
                raw_preapproval_id = authorized_payment.get("preapproval_id")
                if raw_preapproval_id is None or str(raw_preapproval_id).strip() == "":
                    logger.warning(
                        "Authorized payment webhook missing preapproval_id",
                        extra={
                            "operation": "webhook_process",
                            "provider": "mercadopago",
                            "reason": "missing_preapproval_id",
                        },
                    )
                    return {"processed": False, "reason": "missing_preapproval_id"}
                preapproval_id = str(raw_preapproval_id)
            return await self.sync_preapproval(preapproval_id=preapproval_id)
        except BillingServiceError as exc:
            message = str(exc)
            if "was not found" in message:
                reason = (
                    "authorized_payment_not_found"
                    if topic == "subscription_authorized_payment"
                    and "Authorized payment" in message
                    else "preapproval_not_found"
                )
                logger.warning(
                    "Webhook referenced a missing Mercado Pago resource",
                    extra={
                        "operation": "webhook_process",
                        "provider": "mercadopago",
                        "reason": reason,
                    },
                )
                return {"processed": False, "reason": reason}
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
    def _parse_provider_datetime(raw: object) -> datetime | None:
        if not raw:
            return None
        try:
            parsed = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        except ValueError:
            return None
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=UTC)
        return parsed

    @classmethod
    def _resolve_grace_end(cls, preapproval: dict[str, Any]) -> datetime | None:
        status = str(preapproval.get("status") or "").lower()
        if status not in {"cancelled", "canceled", "paused"}:
            return None
        return cls._parse_provider_datetime(preapproval.get("next_payment_date"))
