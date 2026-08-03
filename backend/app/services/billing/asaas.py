from __future__ import annotations

import logging
import re
from datetime import UTC, date, datetime, timedelta
from typing import Any
from uuid import UUID

import httpx

from app.core.config import Settings
from app.services.billing.exceptions import (
    AlreadyPremiumError,
    BillingNotConfiguredError,
    BillingProviderError,
    BillingRateLimitError,
    BillingServiceError,
    BillingSubscriptionNotCancelableError,
    BillingSubscriptionNotFoundError,
    BillingValidationError,
)
from app.services.billing.pricing import PRICING, BillingCycle, PaymentMethod
from app.services.notifications import NotificationService

logger = logging.getLogger(__name__)

PROVIDER = "asaas"
ACTIVATION_EVENTS = frozenset({"PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"})
CANCEL_EVENTS = frozenset(
    {
        "SUBSCRIPTION_INACTIVATED",
        "SUBSCRIPTION_DELETED",
        "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_CANCELLED",
    }
)
# Non-activation lifecycle events. "recorded" is logged only (never grants Premium).
WEBHOOK_EVENT_STATUS: dict[str, str] = {
    "PAYMENT_CONFIRMED": "confirmed",
    "PAYMENT_RECEIVED": "received",
    "SUBSCRIPTION_CREATED": "recorded",
    "PAYMENT_OVERDUE": "overdue",
    "PAYMENT_REFUNDED": "refunded",
    "PAYMENT_DELETED": "payment_deleted",
    "PAYMENT_CHARGEBACK_REQUESTED": "chargeback",
    "SUBSCRIPTION_INACTIVATED": "canceled",
    "SUBSCRIPTION_DELETED": "canceled",
}
PAID_ASAAS_STATUSES = frozenset({"CONFIRMED", "RECEIVED"})


class BillingService:
    def __init__(self, settings: Settings) -> None:
        self.enabled = bool(
            settings.asaas_billing_enabled
            and settings.supabase_url
            and settings.supabase_service_role_key
            and settings.asaas_api_key
        )
        self.mock_checkout = settings.asaas_mock_checkout
        self.api_key = settings.asaas_api_key.strip()
        self.webhook_token = settings.asaas_webhook_access_token.strip()
        self.site_url = (
            settings.billing_site_url.strip() or "https://ai-language-tutor.caps-labs.com"
        )
        self.manage_url = "https://www.asaas.com/customerAccount"
        self.base_url = (
            "https://api-sandbox.asaas.com/v3"
            if settings.asaas_environment == "sandbox"
            else "https://api.asaas.com/v3"
        )
        self.notifications = NotificationService(settings)
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
        self.asaas = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=30,
            headers={
                "access_token": self.api_key,
                "Content-Type": "application/json",
            },
        )
        logger.info(
            "Billing service initialized",
            extra={
                "operation": "billing_initialize",
                "billing_enabled": self.enabled,
                "provider": PROVIDER,
                "mock_checkout": self.mock_checkout,
            },
        )

    async def close(self) -> None:
        await self.db.aclose()
        await self.asaas.aclose()
        await self.notifications.close()

    @staticmethod
    def normalize_cpf(raw: str) -> str:
        digits = re.sub(r"\D", "", raw)
        if len(digits) != 11:
            raise BillingValidationError("Informe um CPF válido com 11 dígitos.")
        return digits

    @staticmethod
    def normalize_phone(raw: str | None) -> str:
        digits = re.sub(r"\D", "", raw or "")
        if len(digits) < 10:
            return "11999999999"
        return digits[:11]

    @staticmethod
    def parse_external_reference(external_reference: str) -> tuple[UUID, str | None, str | None]:
        parts = external_reference.split(":")
        if len(parts) < 2:
            raise BillingServiceError("Invalid external reference")
        user_id = UUID(parts[0])
        billing_cycle = parts[1] or None
        payment_method = parts[2] if len(parts) >= 3 else None
        return user_id, billing_cycle, payment_method

    @staticmethod
    def external_reference(
        *,
        user_id: UUID,
        billing_cycle: BillingCycle,
        payment_method: PaymentMethod,
    ) -> str:
        return f"{user_id}:{billing_cycle}:{payment_method}"

    async def _rpc(self, name: str, payload: dict[str, Any]) -> Any:
        try:
            response = await self.db.post(f"/rpc/{name}", json=payload)
        except httpx.HTTPError as exc:
            raise BillingServiceError(f"Supabase RPC {name} transport failed") from exc
        if response.status_code >= 400:
            raise BillingServiceError(f"Supabase RPC {name} failed: {response.text}")
        if not response.content:
            return None
        try:
            return response.json()
        except ValueError as exc:
            raise BillingServiceError(f"Supabase RPC {name} returned invalid JSON") from exc

    async def _reserve_checkout_or_raise(self, user_id: UUID) -> None:
        reservation = await self._rpc(
            "reserve_billing_checkout_attempt",
            {"p_user_id": str(user_id)},
        )
        if isinstance(reservation, dict) and reservation.get("allowed"):
            return
        reason = reservation.get("reason") if isinstance(reservation, dict) else None
        if reason == "already_premium":
            raise AlreadyPremiumError("User already has Premium")
        if reason == "rate_limit":
            retry_after = (
                reservation.get("retry_after_seconds") if isinstance(reservation, dict) else None
            )
            if isinstance(retry_after, str) and retry_after.isdigit():
                retry_after = int(retry_after)
            if not isinstance(retry_after, int):
                retry_after = 600
            raise BillingRateLimitError(
                "Too many checkout attempts",
                retry_after_seconds=retry_after,
            )
        raise BillingServiceError("Checkout reservation rejected")

    async def _release_checkout_attempt(self, user_id: UUID) -> None:
        try:
            await self._rpc("release_billing_checkout_attempt", {"p_user_id": str(user_id)})
        except BillingServiceError:
            logger.exception(
                "Could not release failed checkout attempt",
                extra={"operation": "checkout_release", "provider": PROVIDER},
            )

    async def _asaas_request(
        self,
        method: str,
        path: str,
        *,
        json: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        try:
            response = await self.asaas.request(method, path, json=json)
        except httpx.HTTPError as exc:
            raise BillingServiceError("Asaas transport failed") from exc
        if response.status_code >= 400:
            raise BillingProviderError(
                f"Asaas request failed: {response.text[:300]}",
                status_code=response.status_code,
            )
        try:
            body = response.json()
        except ValueError as exc:
            raise BillingServiceError("Asaas returned invalid JSON") from exc
        if not isinstance(body, dict):
            raise BillingServiceError("Asaas returned unexpected payload")
        return body

    async def _ensure_customer(
        self,
        *,
        user_id: UUID,
        user_email: str,
        cpf: str,
        display_name: str | None,
    ) -> str:
        external_reference = str(user_id)
        search = await self._asaas_request(
            "GET",
            f"/customers?externalReference={external_reference}&limit=1",
        )
        data = search.get("data")
        if isinstance(data, list) and data and isinstance(data[0], dict) and data[0].get("id"):
            return str(data[0]["id"])

        created = await self._asaas_request(
            "POST",
            "/customers",
            json={
                "name": (display_name or user_email.split("@", 1)[0])[:100],
                "email": user_email,
                "cpfCnpj": cpf,
                "externalReference": external_reference,
                "notificationDisabled": False,
            },
        )
        customer_id = created.get("id")
        if not customer_id:
            raise BillingServiceError("Asaas customer creation returned no id")
        return str(customer_id)

    async def _record_pending_checkout(
        self,
        *,
        user_id: UUID,
        billing_cycle: BillingCycle,
        external_subscription_id: str,
        payment_method: PaymentMethod,
    ) -> None:
        await self._rpc(
            "create_billing_checkout",
            {
                "p_user_id": str(user_id),
                "p_billing_cycle": billing_cycle,
                "p_external_subscription_id": external_subscription_id,
                "p_payment_method": payment_method,
                "p_subscription_source": PROVIDER,
            },
        )

    async def create_subscription_checkout(
        self,
        *,
        user_id: UUID,
        user_email: str | None,
        display_name: str | None,
        billing_cycle: BillingCycle,
        payment_method: PaymentMethod,
        cpf: str,
        remote_ip: str | None,
        card_holder_name: str | None = None,
        card_number: str | None = None,
        card_expiry_month: str | None = None,
        card_expiry_year: str | None = None,
        card_cvv: str | None = None,
        holder_postal_code: str | None = None,
        holder_address_number: str | None = None,
        holder_phone: str | None = None,
    ) -> dict[str, Any]:
        if not user_email:
            raise BillingValidationError("E-mail confirmado é obrigatório para assinar.")
        if not self.enabled and not self.mock_checkout:
            raise BillingNotConfiguredError("Asaas billing is not configured")

        pricing = PRICING[billing_cycle]
        normalized_cpf = self.normalize_cpf(cpf)

        if self.mock_checkout:
            external_id = f"mock:{user_id}:{billing_cycle}:{payment_method}"
            await self._record_pending_checkout(
                user_id=user_id,
                billing_cycle=billing_cycle,
                external_subscription_id=external_id,
                payment_method=payment_method,
            )
            return {
                "status": "pending",
                "payment_method": payment_method,
                "external_subscription_id": external_id,
                "amount": float(pricing["amount"]),
                "currency": "BRL",
                "billing_cycle": billing_cycle,
                "message": "Checkout simulado criado. Confirme via webhook mock.",
                "mock_checkout": True,
            }

        await self._reserve_checkout_or_raise(user_id=user_id)
        try:
            customer_id = await self._ensure_customer(
                user_id=user_id,
                user_email=user_email,
                cpf=normalized_cpf,
                display_name=display_name,
            )
            external_reference = self.external_reference(
                user_id=user_id,
                billing_cycle=billing_cycle,
                payment_method=payment_method,
            )

            if payment_method == "card":
                if (
                    not card_holder_name
                    or not card_number
                    or not card_expiry_month
                    or not card_expiry_year
                    or not card_cvv
                ):
                    raise BillingValidationError("Dados do cartão incompletos.")
                subscription = await self._asaas_request(
                    "POST",
                    "/subscriptions",
                    json={
                        "customer": customer_id,
                        "billingType": "CREDIT_CARD",
                        "cycle": pricing["cycle"],
                        "value": pricing["amount"],
                        "nextDueDate": date.today().isoformat(),
                        "description": pricing["description"],
                        "externalReference": external_reference,
                        "creditCard": {
                            "holderName": card_holder_name,
                            "number": re.sub(r"\D", "", card_number),
                            "expiryMonth": card_expiry_month,
                            "expiryYear": card_expiry_year,
                            "ccv": card_cvv,
                        },
                        "creditCardHolderInfo": {
                            "name": card_holder_name,
                            "email": user_email,
                            "cpfCnpj": normalized_cpf,
                            "postalCode": re.sub(r"\D", "", holder_postal_code or "01310100"),
                            "addressNumber": holder_address_number or "100",
                            "phone": self.normalize_phone(holder_phone),
                        },
                        "remoteIp": remote_ip or "127.0.0.1",
                    },
                )
                subscription_id = str(subscription.get("id") or "")
                if not subscription_id:
                    raise BillingServiceError("Asaas did not return subscription id")
                await self._record_pending_checkout(
                    user_id=user_id,
                    billing_cycle=billing_cycle,
                    external_subscription_id=subscription_id,
                    payment_method=payment_method,
                )
                return {
                    "status": "pending",
                    "payment_method": payment_method,
                    "external_subscription_id": subscription_id,
                    "amount": float(pricing["amount"]),
                    "currency": "BRL",
                    "billing_cycle": billing_cycle,
                    "message": (
                        "Cartão validado. Seu Premium será liberado assim que o pagamento "
                        "for confirmado."
                    ),
                    "mock_checkout": False,
                }

            pix_payment = await self._asaas_request(
                "POST",
                "/payments",
                json={
                    "customer": customer_id,
                    "billingType": "PIX",
                    "value": pricing["amount"],
                    "dueDate": date.today().isoformat(),
                    "description": pricing["description"],
                    "externalReference": external_reference,
                },
            )
            payment_id = str(pix_payment.get("id") or "")
            if not payment_id:
                raise BillingServiceError("Asaas did not return PIX payment id")
            await self._record_pending_checkout(
                user_id=user_id,
                billing_cycle=billing_cycle,
                external_subscription_id=payment_id,
                payment_method=payment_method,
            )
            encoded_image = pix_payment.get("encodedImage")
            payload = pix_payment.get("payload")
            encoded_image, payload = await self._fetch_pix_qr_fields(
                payment_id=payment_id,
                encoded_image=encoded_image,
                payload=payload,
            )
            return {
                "status": "pending",
                "payment_method": payment_method,
                "external_subscription_id": payment_id,
                "amount": float(pricing["amount"]),
                "currency": "BRL",
                "billing_cycle": billing_cycle,
                "pix_qr_code": encoded_image if isinstance(encoded_image, str) else None,
                "pix_copy_paste": payload if isinstance(payload, str) else None,
                "message": (
                    "Pague o PIX para confirmar sua assinatura. O Premium será liberado após "
                    "a confirmação do pagamento."
                ),
                "mock_checkout": False,
            }
        except BillingServiceError:
            await self._release_checkout_attempt(user_id)
            raise

    async def _fetch_pix_qr_fields(
        self,
        *,
        payment_id: str,
        encoded_image: Any = None,
        payload: Any = None,
    ) -> tuple[str | None, str | None]:
        image = encoded_image if isinstance(encoded_image, str) else None
        copy_paste = payload if isinstance(payload, str) else None
        if image and copy_paste:
            return image, copy_paste
        pix_qr = await self._asaas_request("GET", f"/payments/{payment_id}/pixQrCode")
        if not image:
            qr_image = pix_qr.get("encodedImage")
            image = qr_image if isinstance(qr_image, str) else None
        if not copy_paste:
            qr_payload = pix_qr.get("payload")
            copy_paste = qr_payload if isinstance(qr_payload, str) else None
        return image, copy_paste

    async def _load_latest_pending_checkout(self, *, user_id: UUID) -> dict[str, Any] | None:
        try:
            response = await self.db.get(
                "/billing_checkouts",
                params={
                    "user_id": f"eq.{user_id}",
                    "status": "eq.pending",
                    "select": (
                        "id,billing_cycle,external_subscription_id,payment_method,status,created_at"
                    ),
                    "order": "created_at.desc",
                    "limit": "1",
                },
            )
        except httpx.HTTPError as exc:
            raise BillingServiceError("Could not load pending checkout") from exc
        if response.status_code >= 400:
            raise BillingServiceError("Could not load pending checkout")
        rows = response.json()
        if not isinstance(rows, list) or not rows or not isinstance(rows[0], dict):
            return None
        return rows[0]

    @staticmethod
    def _checkout_status_message(
        *,
        payment_method: str,
        payment_status: str,
    ) -> str:
        if payment_status == "confirmed":
            return "Pagamento confirmado."
        if payment_status == "overdue":
            return "Pagamento vencido. Gere um novo PIX para continuar."
        if payment_status == "canceled":
            return "Pagamento cancelado."
        if payment_method == "pix_automatic":
            return (
                "Aguardando pagamento via PIX. Escaneie o QR code ou copie o código "
                "para concluir sua assinatura."
            )
        return "Aguardando confirmação do pagamento no cartão."

    async def get_checkout_status(self, *, user_id: UUID) -> dict[str, Any]:
        if not self.enabled and not self.mock_checkout:
            raise BillingNotConfiguredError("Asaas billing is not configured")

        subscription = await self._load_user_subscription(user_id=user_id)
        if subscription:
            plan_id = str(subscription.get("plan_id") or "free")
            sub_status = str(subscription.get("status") or "active")
            if plan_id == "premium" and sub_status == "active":
                return {"has_pending_checkout": False}

        checkout = await self._load_latest_pending_checkout(user_id=user_id)
        external_id = str(checkout.get("external_subscription_id") or "") if checkout else ""
        payment_method = str(
            (checkout or {}).get("payment_method")
            or (subscription or {}).get("payment_method")
            or "card"
        )
        billing_cycle = (checkout or {}).get("billing_cycle") or (subscription or {}).get(
            "billing_cycle"
        )
        checkout_created_at = (checkout or {}).get("created_at")

        if not external_id and subscription and subscription.get("subscription_source") == PROVIDER:
            external_id = str(subscription.get("external_subscription_id") or "")

        if not external_id:
            return {"has_pending_checkout": False}

        if billing_cycle not in PRICING:
            billing_cycle = "monthly"
        pricing = PRICING[billing_cycle]  # type: ignore[index]
        amount = float(pricing["amount"])

        if self.mock_checkout and external_id.startswith("mock:"):
            return {
                "has_pending_checkout": True,
                "checkout_status": "pending",
                "payment_status": "pending",
                "payment_method": payment_method,
                "billing_cycle": billing_cycle,
                "amount": amount,
                "currency": "BRL",
                "external_subscription_id": external_id,
                "checkout_created_at": checkout_created_at,
                "message": self._checkout_status_message(
                    payment_method=payment_method,
                    payment_status="pending",
                ),
            }

        if payment_method == "pix_automatic":
            payment = await self._asaas_request("GET", f"/payments/{external_id}")
        else:
            payment_list = await self._asaas_request(
                "GET",
                f"/subscriptions/{external_id}/payments?limit=1",
            )
            data = payment_list.get("data")
            payment = data[0] if isinstance(data, list) and data else {}

        provider_status = str(payment.get("status") or "").upper()
        mapped = self._map_payment_status(provider_status)

        if mapped in {"confirmed", "received"}:
            sync_result = await self._process_provider_status(
                user_id=user_id,
                external_subscription_id=external_id,
                external_customer_id=str(payment.get("customer") or ""),
                provider_status=mapped,
                billing_cycle=billing_cycle,
                payment_method=payment_method,
                payload=payment if isinstance(payment, dict) else {},
                event_key=f"status:{external_id}:{provider_status}",
            )
            if str(sync_result.get("subscription_status") or "") == "active":
                return {
                    "has_pending_checkout": False,
                    "payment_status": "confirmed",
                    "message": "Pagamento confirmado. Premium ativo.",
                }
            return {
                "has_pending_checkout": True,
                "checkout_status": "pending",
                "payment_status": "confirmed",
                "payment_method": payment_method,
                "billing_cycle": billing_cycle,
                "amount": amount,
                "currency": "BRL",
                "external_subscription_id": external_id,
                "checkout_created_at": checkout_created_at,
                "message": "Pagamento confirmado. Ativando Premium...",
            }

        if mapped in {"canceled", "overdue"} or provider_status in {"REFUNDED", "DELETED"}:
            return {
                "has_pending_checkout": False,
                "payment_status": mapped,
                "payment_method": payment_method,
                "billing_cycle": billing_cycle,
                "amount": amount,
                "currency": "BRL",
                "external_subscription_id": external_id,
                "checkout_created_at": checkout_created_at,
                "message": self._checkout_status_message(
                    payment_method=payment_method,
                    payment_status=mapped,
                ),
            }

        pix_qr_code: str | None = None
        pix_copy_paste: str | None = None
        if payment_method == "pix_automatic":
            pix_qr_code, pix_copy_paste = await self._fetch_pix_qr_fields(
                payment_id=external_id,
                encoded_image=payment.get("encodedImage") if isinstance(payment, dict) else None,
                payload=payment.get("payload") if isinstance(payment, dict) else None,
            )

        return {
            "has_pending_checkout": True,
            "checkout_status": "pending",
            "payment_status": "pending",
            "payment_method": payment_method,
            "billing_cycle": billing_cycle,
            "amount": amount,
            "currency": "BRL",
            "external_subscription_id": external_id,
            "pix_qr_code": pix_qr_code,
            "pix_copy_paste": pix_copy_paste,
            "checkout_created_at": checkout_created_at,
            "message": self._checkout_status_message(
                payment_method=payment_method,
                payment_status="pending",
            ),
        }

    async def _load_user_subscription(self, *, user_id: UUID) -> dict[str, Any] | None:
        try:
            response = await self.db.get(
                "/user_subscriptions",
                params={
                    "user_id": f"eq.{user_id}",
                    "select": (
                        "plan_id,status,started_at,ends_at,renews_at,billing_cycle,"
                        "subscription_source,external_subscription_id,payment_method"
                    ),
                    "limit": "1",
                },
            )
        except httpx.HTTPError as exc:
            raise BillingServiceError("Could not load billing subscription") from exc
        if response.status_code >= 400:
            raise BillingServiceError("Could not load billing subscription")
        rows = response.json()
        if not isinstance(rows, list) or not rows or not isinstance(rows[0], dict):
            return None
        return rows[0]

    async def cancel_subscription(self, *, user_id: UUID) -> dict[str, Any]:
        if not self.enabled:
            raise BillingNotConfiguredError("Asaas billing is not configured")
        subscription = await self._load_user_subscription(user_id=user_id)
        if not subscription:
            raise BillingSubscriptionNotFoundError("Subscription was not found")
        if subscription.get("subscription_source") != PROVIDER:
            raise BillingSubscriptionNotCancelableError(
                "Only Asaas subscriptions can be canceled by the user"
            )
        external_id = str(subscription.get("external_subscription_id") or "")
        if not external_id:
            raise BillingSubscriptionNotFoundError("Subscription was not found")

        payment_method = str(subscription.get("payment_method") or "card")
        if payment_method == "pix_automatic":
            await self._asaas_request("DELETE", f"/payments/{external_id}")
        else:
            await self._asaas_request("DELETE", f"/subscriptions/{external_id}")

        grace_end = datetime.now(tz=UTC) + timedelta(days=30)
        result = await self._process_provider_status(
            user_id=user_id,
            external_subscription_id=external_id,
            external_customer_id=None,
            provider_status="canceled",
            billing_cycle=subscription.get("billing_cycle"),
            payment_method=payment_method,
            payload={"ends_at": grace_end.isoformat()},
            event_key=f"cancel:{external_id}",
            ends_at=grace_end,
        )
        return {
            "subscription_status": str(result.get("subscription_status") or "canceled"),
            "subscription_ends_at": result.get("ends_at"),
            "external_subscription_id": external_id,
        }

    async def refresh_user_subscription(self, *, user_id: UUID) -> dict[str, Any]:
        reservation = await self._rpc(
            "reserve_billing_refresh_attempt",
            {"p_user_id": str(user_id)},
        )
        if not isinstance(reservation, dict) or not reservation.get("allowed"):
            raise BillingRateLimitError("Too many refresh attempts", retry_after_seconds=60)

        subscription = await self._load_user_subscription(user_id=user_id)
        if not subscription or subscription.get("subscription_source") != PROVIDER:
            return {"updated": False, "reason": "no_provider_subscription"}

        external_id = str(subscription.get("external_subscription_id") or "")
        payment_method = str(subscription.get("payment_method") or "card")
        if not external_id:
            return {"updated": False, "reason": "missing_external_id"}

        if self.mock_checkout and external_id.startswith("mock:"):
            result = await self._process_provider_status(
                user_id=user_id,
                external_subscription_id=external_id,
                external_customer_id=None,
                provider_status="confirmed",
                billing_cycle=subscription.get("billing_cycle"),
                payment_method=payment_method,
                payload={"mock": True},
                event_key=f"mock-refresh:{external_id}",
            )
            return {
                "updated": bool(result.get("updated")),
                "plan_id": result.get("plan_id"),
                "subscription_status": result.get("subscription_status"),
                "reason": result.get("reason"),
            }

        if payment_method == "pix_automatic":
            payment = await self._asaas_request("GET", f"/payments/{external_id}")
        else:
            payment_list = await self._asaas_request(
                "GET",
                f"/subscriptions/{external_id}/payments?limit=1",
            )
            data = payment_list.get("data")
            payment = data[0] if isinstance(data, list) and data else {}

        status = str(payment.get("status") or "").upper()
        mapped = self._map_payment_status(status)
        if mapped not in {"confirmed", "received"}:
            return {
                "updated": False,
                "reason": "payment_not_confirmed",
                "subscription_status": "pending",
            }

        result = await self._process_provider_status(
            user_id=user_id,
            external_subscription_id=external_id,
            external_customer_id=str(payment.get("customer") or ""),
            provider_status=mapped,
            billing_cycle=subscription.get("billing_cycle"),
            payment_method=payment_method,
            payload=payment,
            event_key=f"refresh:{external_id}:{status}",
        )
        return {
            "updated": bool(result.get("updated")),
            "plan_id": result.get("plan_id"),
            "subscription_status": result.get("subscription_status"),
            "reason": result.get("reason"),
        }

    @staticmethod
    def _map_payment_status(status: str) -> str:
        normalized = status.upper()
        if normalized in {"CONFIRMED", "RECEIVED"}:
            return normalized.lower()
        if normalized in {"PENDING", "AWAITING_RISK_ANALYSIS"}:
            return "pending"
        if normalized in {"OVERDUE"}:
            return "overdue"
        if normalized in {"REFUNDED", "CANCELLED", "DELETED"}:
            return "canceled"
        return normalized.lower()

    async def _process_provider_status(
        self,
        *,
        user_id: UUID,
        external_subscription_id: str,
        external_customer_id: str | None,
        provider_status: str,
        billing_cycle: str | None,
        payment_method: str | None,
        payload: dict[str, Any],
        event_key: str,
        ends_at: datetime | None = None,
        notify_email: str | None = None,
    ) -> dict[str, Any]:
        result = await self._rpc(
            "process_billing_event",
            {
                "p_provider": PROVIDER,
                "p_event_key": event_key,
                "p_payload": payload,
                "p_user_id": str(user_id),
                "p_external_subscription_id": external_subscription_id,
                "p_external_customer_id": external_customer_id,
                "p_mp_status": provider_status,
                "p_billing_cycle": billing_cycle,
                "p_ends_at": ends_at.isoformat() if ends_at else None,
                "p_subscription_source": PROVIDER,
                "p_payment_method": payment_method,
            },
        )
        if (
            notify_email
            and isinstance(result, dict)
            and result.get("subscription_status") == "active"
            and result.get("reason") != "duplicate_event"
            and provider_status in {"confirmed", "received"}
        ):
            await self.notifications.send_premium_activated_email(
                to_email=notify_email,
                billing_cycle=str(billing_cycle or "monthly"),
                payment_method=str(payment_method or "card"),
            )
        return result if isinstance(result, dict) else {"updated": False}

    def verify_webhook_token(self, token: str | None) -> bool:
        if self.mock_checkout and not self.webhook_token:
            return True
        return bool(self.webhook_token and token == self.webhook_token)

    @staticmethod
    def _map_subscription_updated_status(status: str | None) -> str:
        """ACTIVE never grants Premium — only cancel/inactive lifecycle."""
        normalized = str(status or "").upper()
        if normalized in {"INACTIVE", "EXPIRED", "DELETED"}:
            return "canceled"
        return "recorded"

    async def _verify_paid_payment(self, payment_id: str) -> dict[str, Any] | None:
        """Re-fetch payment from Asaas; only CONFIRMED/RECEIVED may activate Premium."""
        if not payment_id:
            return None
        try:
            payment = await self._asaas_request("GET", f"/payments/{payment_id}")
        except (BillingServiceError, BillingProviderError):
            return None
        status = str(payment.get("status") or "").upper()
        if status not in PAID_ASAAS_STATUSES:
            return None
        return payment

    async def _lookup_user_id_by_external_id(self, external_id: str) -> UUID | None:
        if not external_id:
            return None
        try:
            response = await self.db.get(
                "/user_subscriptions",
                params={
                    "external_subscription_id": f"eq.{external_id}",
                    "select": "user_id",
                    "limit": "1",
                },
            )
        except httpx.HTTPError:
            return None
        if response.status_code >= 400:
            return None
        rows = response.json()
        if not isinstance(rows, list) or not rows or not isinstance(rows[0], dict):
            return None
        raw_user_id = rows[0].get("user_id")
        if not raw_user_id:
            return None
        try:
            return UUID(str(raw_user_id))
        except ValueError:
            return None

    async def _resolve_webhook_context(
        self,
        *,
        event: str,
        payment: dict[str, Any],
        subscription: dict[str, Any],
    ) -> tuple[UUID, str | None, str | None, str] | None:
        external_reference = str(
            payment.get("externalReference") or subscription.get("externalReference") or ""
        )
        external_subscription_id = str(
            subscription.get("id") or payment.get("subscription") or payment.get("id") or ""
        )
        if not external_subscription_id:
            return None

        billing_cycle: str | None = None
        payment_method: str | None = None
        user_id: UUID | None = None

        if external_reference:
            try:
                user_id, billing_cycle, payment_method = self.parse_external_reference(
                    external_reference
                )
            except (BillingServiceError, ValueError):
                user_id = None

        if user_id is None:
            user_id = await self._lookup_user_id_by_external_id(external_subscription_id)
            if user_id is None and payment.get("subscription"):
                user_id = await self._lookup_user_id_by_external_id(str(payment["subscription"]))

        if user_id is None:
            return None

        if event == "SUBSCRIPTION_UPDATED":
            provider_status = self._map_subscription_updated_status(
                str(subscription.get("status") or "")
            )
        elif event in CANCEL_EVENTS:
            provider_status = "canceled"
        elif event in WEBHOOK_EVENT_STATUS:
            provider_status = WEBHOOK_EVENT_STATUS[event]
        else:
            # Unknown events are logged only — never grant Premium.
            provider_status = "recorded"

        if payment_method is None:
            billing_type = str(payment.get("billingType") or subscription.get("billingType") or "")
            payment_method = "pix_automatic" if billing_type.upper() == "PIX" else "card"

        return user_id, billing_cycle, payment_method, provider_status

    async def get_billing_history(self, *, user_id: UUID) -> dict[str, Any]:
        subscription = await self._load_user_subscription(user_id=user_id)

        try:
            checkout_response = await self.db.get(
                "/billing_checkouts",
                params={
                    "user_id": f"eq.{user_id}",
                    "select": (
                        "id,billing_cycle,payment_method,status,external_subscription_id,"
                        "created_at,updated_at"
                    ),
                    "order": "created_at.desc",
                    "limit": "20",
                },
            )
        except httpx.HTTPError as exc:
            raise BillingServiceError("Could not load billing checkouts") from exc
        if checkout_response.status_code >= 400:
            raise BillingServiceError("Could not load billing checkouts")

        try:
            events_response = await self.db.get(
                "/billing_events",
                params={
                    "user_id": f"eq.{user_id}",
                    "select": "id,event_type,event_key,processed_at,payload",
                    "order": "processed_at.desc",
                    "limit": "30",
                },
            )
        except httpx.HTTPError as exc:
            raise BillingServiceError("Could not load billing events") from exc
        if events_response.status_code >= 400:
            raise BillingServiceError("Could not load billing events")

        checkout_rows = checkout_response.json()
        event_rows = events_response.json()
        checkouts: list[dict[str, Any]] = []
        if isinstance(checkout_rows, list):
            for row in checkout_rows:
                if not isinstance(row, dict):
                    continue
                cycle = str(row.get("billing_cycle") or "monthly")
                cycle_key: BillingCycle = "annual" if cycle == "annual" else "monthly"
                pricing = PRICING[cycle_key]
                checkouts.append(
                    {
                        "id": row.get("id"),
                        "billing_cycle": cycle,
                        "payment_method": row.get("payment_method"),
                        "status": row.get("status"),
                        "external_subscription_id": row.get("external_subscription_id"),
                        "amount": float(pricing["amount"]),
                        "currency": "BRL",
                        "created_at": row.get("created_at"),
                        "updated_at": row.get("updated_at"),
                    }
                )

        events: list[dict[str, Any]] = []
        if isinstance(event_rows, list):
            for row in event_rows:
                if not isinstance(row, dict):
                    continue
                payload = row.get("payload")
                payload_dict = payload if isinstance(payload, dict) else {}
                events.append(
                    {
                        "id": row.get("id"),
                        "event_type": row.get("event_type") or payload_dict.get("event"),
                        "event_key": row.get("event_key"),
                        "processed_at": row.get("processed_at"),
                        "payment_status": payload_dict.get("status")
                        if isinstance(payload_dict.get("status"), str)
                        else None,
                    }
                )

        pending_checkout = next(
            (checkout for checkout in checkouts if checkout.get("status") == "pending"),
            None,
        )

        return {
            "subscription": subscription,
            "checkouts": checkouts,
            "events": events,
            "pending_checkout": pending_checkout,
        }

    async def handle_webhook(self, body: dict[str, Any]) -> dict[str, Any]:
        event = str(body.get("event") or "")
        event_id = str(body.get("id") or event)
        payment_raw = body.get("payment")
        payment: dict[str, Any] = payment_raw if isinstance(payment_raw, dict) else {}
        subscription_raw = body.get("subscription")
        subscription: dict[str, Any] = (
            subscription_raw if isinstance(subscription_raw, dict) else {}
        )

        resolved = await self._resolve_webhook_context(
            event=event,
            payment=payment,
            subscription=subscription,
        )
        if resolved is None:
            return {"processed": False, "reason": "unresolved_webhook_context", "event": event}

        user_id, billing_cycle, payment_method, provider_status = resolved
        external_subscription_id = str(
            subscription.get("id") or payment.get("subscription") or payment.get("id") or ""
        )
        customer_id = str(payment.get("customer") or subscription.get("customer") or "")

        # Premium only after Asaas confirms the payment resource server-side.
        if event in ACTIVATION_EVENTS:
            payment_id = str(payment.get("id") or "")
            verified = await self._verify_paid_payment(payment_id)
            if verified is None:
                logger.warning(
                    "Webhook activation rejected: payment not confirmed on Asaas",
                    extra={
                        "operation": "webhook_verify_payment",
                        "provider": PROVIDER,
                        "event": event,
                        "payment_id": payment_id,
                    },
                )
                return {
                    "processed": False,
                    "reason": "payment_not_confirmed_on_asaas",
                    "event": event,
                }
            payment = verified
            customer_id = str(payment.get("customer") or customer_id)
            provider_status = "confirmed" if event == "PAYMENT_CONFIRMED" else "received"
            # Prefer subscription id when present so renewals stay linked.
            if payment.get("subscription"):
                external_subscription_id = str(payment["subscription"])
            else:
                external_subscription_id = payment_id

        notify_email: str | None = None
        if provider_status in {"confirmed", "received"} and customer_id:
            try:
                customer = await self._asaas_request("GET", f"/customers/{customer_id}")
                notify_email = str(customer.get("email") or "") or None
            except BillingServiceError:
                notify_email = None

        result = await self._process_provider_status(
            user_id=user_id,
            external_subscription_id=external_subscription_id,
            external_customer_id=customer_id or None,
            provider_status=provider_status,
            billing_cycle=billing_cycle,
            payment_method=payment_method,
            payload={**payment, **subscription, "event": event},
            event_key=f"{event_id}:{external_subscription_id}:{provider_status}",
            notify_email=notify_email,
        )
        return {"processed": True, "event": event, **result}
