from __future__ import annotations

import hashlib
import hmac
import re
from datetime import UTC, datetime
from typing import Any, Literal
from uuid import UUID, uuid4

import httpx

from app.core.config import Settings

BillingCycle = Literal["monthly", "annual"]

PRICING: dict[BillingCycle, dict[str, Any]] = {
    "monthly": {
        "amount": 19.90,
        "frequency": 1,
        "frequency_type": "months",
        "reason": "Lume Tutor Premium - Mensal",
    },
    "annual": {
        "amount": 189.90,
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
    pass


class AlreadyPremiumError(BillingServiceError):
    pass


class BillingService:
    def __init__(self, settings: Settings) -> None:
        self.enabled = bool(
            settings.mercadopago_billing_enabled
            and settings.supabase_url
            and settings.supabase_service_role_key
            and settings.mercadopago_access_token
        )
        self.mock_checkout = settings.mercadopago_mock_checkout
        self.access_token = settings.mercadopago_access_token
        self.webhook_secret = settings.mercadopago_webhook_secret
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
                "Authorization": f"Bearer {settings.mercadopago_access_token}",
                "Content-Type": "application/json",
            },
        )

    async def close(self) -> None:
        await self.db.aclose()
        await self.mp.aclose()

    async def _rpc(self, name: str, payload: dict[str, Any]) -> Any:
        if not self.db.headers.get("apikey"):
            raise BillingNotConfiguredError("Billing database is not configured")
        response = await self.db.post(f"/rpc/{name}", json=payload)
        if response.status_code >= 400:
            raise BillingServiceError(f"Billing RPC {name} failed: {response.text}")
        return response.json()

    async def create_checkout(
        self,
        *,
        user_id: UUID,
        user_email: str | None,
        billing_cycle: BillingCycle,
    ) -> dict[str, str]:
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
            return {
                "checkout_url": f"{self.back_url}?mock=1&cycle={billing_cycle}",
                "external_subscription_id": external_id,
            }

        if not self.enabled:
            raise BillingNotConfiguredError("Mercado Pago billing is not configured")

        reservation = await self._rpc(
            "reserve_billing_checkout_attempt",
            {"p_user_id": str(user_id)},
        )
        if not isinstance(reservation, dict) or not reservation.get("allowed"):
            reason = reservation.get("reason") if isinstance(reservation, dict) else None
            if reason == "already_premium":
                raise AlreadyPremiumError("User already has an active premium subscription")
            raise BillingRateLimitError("Too many checkout attempts")

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
        if user_email:
            payload["payer_email"] = user_email
        if self.notification_url:
            payload["notification_url"] = self.notification_url

        response = await self.mp.post(
            "/preapproval",
            json=payload,
            headers={"X-Idempotency-Key": str(uuid4())},
        )
        if response.status_code >= 400:
            raise BillingServiceError(f"Mercado Pago checkout failed: {response.text}")

        body = response.json()
        checkout_url = body.get("init_point") or body.get("sandbox_init_point")
        external_id = body.get("id")
        if not checkout_url or not external_id:
            raise BillingServiceError("Mercado Pago checkout returned an incomplete payload")

        await self._rpc(
            "create_billing_checkout",
            {
                "p_user_id": str(user_id),
                "p_billing_cycle": billing_cycle,
                "p_external_subscription_id": str(external_id),
            },
        )
        return {
            "checkout_url": str(checkout_url),
            "external_subscription_id": str(external_id),
        }

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

        if not self.enabled:
            raise BillingNotConfiguredError("Mercado Pago billing is not configured")

        response = await self.mp.get(f"/preapproval/{preapproval_id}")
        if response.status_code >= 400:
            raise BillingServiceError(f"Mercado Pago lookup failed: {response.text}")
        body = response.json()
        if not isinstance(body, dict):
            raise BillingServiceError("Mercado Pago lookup returned invalid payload")
        return body

    async def refresh_user_subscription(self, *, user_id: UUID) -> dict[str, Any]:
        reservation = await self._rpc(
            "reserve_billing_refresh_attempt",
            {"p_user_id": str(user_id)},
        )
        if not isinstance(reservation, dict) or not reservation.get("allowed"):
            raise BillingRateLimitError("Too many subscription refresh attempts")

        response = await self.db.get(
            "/billing_checkouts",
            params={
                "user_id": f"eq.{user_id}",
                "order": "created_at.desc",
                "limit": "1",
            },
        )
        if response.status_code >= 400:
            raise BillingServiceError("Could not load pending billing checkout")

        rows = response.json()
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
        del payload
        if not resource_id:
            return {"processed": False, "reason": "missing_resource_id"}

        if topic and topic not in {"subscription_preapproval", "preapproval"}:
            return {"processed": False, "reason": "ignored_topic"}

        return await self.sync_preapproval(preapproval_id=resource_id)

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
