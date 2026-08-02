from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status

from app.api.dependencies import BillingDependency, EntitlementDependency
from app.core.security import get_current_user
from app.schemas.auth import AuthenticatedUser
from app.schemas.billing import (
    BillingRefreshResponse,
    BillingSubscriptionView,
    CheckoutRequest,
    CheckoutResponse,
)
from app.services.billing import (
    AlreadyPremiumError,
    BillingNotConfiguredError,
    BillingRateLimitError,
    BillingServiceError,
)

router = APIRouter(prefix="/api/v1/billing", tags=["billing"])


@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout(
    payload: CheckoutRequest,
    billing: BillingDependency,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
) -> CheckoutResponse:
    try:
        result = await billing.create_checkout(
            user_id=user.id,
            user_email=user.email,
            billing_cycle=payload.billing_cycle,
        )
    except BillingNotConfiguredError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Pagamentos ainda não estão disponíveis.",
        ) from exc
    except AlreadyPremiumError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Você já possui uma assinatura Premium ativa.",
        ) from exc
    except BillingRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Muitas tentativas de checkout. Aguarde alguns minutos.",
        ) from exc
    except BillingServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Não foi possível iniciar o checkout agora.",
        ) from exc
    return CheckoutResponse.model_validate(result)


@router.get("/subscription", response_model=BillingSubscriptionView)
async def subscription_status(
    entitlements: EntitlementDependency,
    billing: BillingDependency,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
) -> BillingSubscriptionView:
    summary = await entitlements.get_summary(user.id)
    if not summary.get("found", False):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found.")
    can_manage = bool(summary.get("can_manage_billing"))
    return BillingSubscriptionView(
        plan_id=str(summary.get("plan_id") or "free"),
        subscription_status=str(summary.get("subscription_status") or "active"),
        subscription_ends_at=summary.get("subscription_ends_at"),
        billing_cycle=summary.get("billing_cycle"),
        subscription_source=str(summary.get("subscription_source") or "system"),
        can_manage_billing=can_manage,
        manage_url=billing.manage_url if can_manage else None,
    )


@router.post("/refresh", response_model=BillingRefreshResponse)
async def refresh_subscription(
    billing: BillingDependency,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
) -> BillingRefreshResponse:
    try:
        result = await billing.refresh_user_subscription(user_id=user.id)
    except BillingNotConfiguredError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Pagamentos ainda não estão disponíveis.",
        ) from exc
    except BillingRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Muitas tentativas de atualização. Aguarde alguns instantes.",
        ) from exc
    except BillingServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Não foi possível sincronizar sua assinatura.",
        ) from exc
    return BillingRefreshResponse(
        updated=bool(result.get("updated")),
        plan_id=result.get("plan_id"),
        subscription_status=result.get("subscription_status"),
        reason=result.get("reason"),
    )


@router.post("/webhook")
async def mercadopago_webhook(
    request: Request,
    billing: BillingDependency,
    topic: str | None = Query(default=None),
    id: str | None = Query(default=None, alias="id"),
    data_id: str | None = Query(default=None, alias="data.id"),
    x_signature: str | None = Header(default=None),
    x_request_id: str | None = Header(default=None),
) -> dict[str, Any]:
    resource_id = id or data_id
    payload: dict[str, Any] | None = None

    if not resource_id:
        try:
            body = await request.json()
        except Exception:
            body = {}
        if isinstance(body, dict):
            payload = body
            data = body.get("data")
            if isinstance(data, dict) and data.get("id"):
                resource_id = str(data["id"])
            topic = topic or str(body.get("type") or body.get("topic") or "")

    if not billing.verify_webhook_signature(
        resource_id=resource_id,
        request_id=x_request_id,
        signature=x_signature,
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook signature.",
        )

    try:
        result = await billing.handle_notification(
            resource_id=resource_id,
            topic=topic,
            payload=payload,
        )
    except BillingServiceError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Webhook processing failed.",
        ) from None
    return result


@router.get("/plans")
async def billing_plans() -> dict[str, Any]:
    from app.services.billing import PRICING

    return {
        "currency": "BRL",
        "plans": {
            "monthly": {
                "amount": PRICING["monthly"]["amount"],
                "label": "Mensal",
            },
            "annual": {
                "amount": PRICING["annual"]["amount"],
                "label": "Anual",
                "savings_label": "Economize 2 meses",
            },
        },
        "comparison": {
            "free": {
                "conversation_sessions": 2,
                "llm_requests": 40,
                "transcriptions": 10,
                "messages_per_session": 30,
            },
            "premium": {
                "conversation_sessions": 20,
                "llm_requests": 500,
                "transcriptions": 100,
                "messages_per_session": 60,
            },
        },
    }
