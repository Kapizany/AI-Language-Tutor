import logging
from typing import Annotated, Any, NoReturn

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status

from app.api.dependencies import BillingDependency, EntitlementDependency
from app.core.security import get_current_user
from app.schemas.auth import AuthenticatedUser
from app.schemas.billing import (
    AbandonCheckoutRequest,
    BillingHistoryResponse,
    BillingRefreshResponse,
    BillingSubscriptionView,
    CancelSubscriptionResponse,
    CheckoutStatusResponse,
    CheckoutSubscribeRequest,
    CheckoutSubscribeResponse,
    ResumeCheckoutRequest,
)
from app.services.billing import (
    AlreadyPremiumError,
    BillingNotConfiguredError,
    BillingProviderError,
    BillingRateLimitError,
    BillingServiceError,
    BillingSubscriptionNotCancelableError,
    BillingSubscriptionNotFoundError,
    BillingValidationError,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/billing", tags=["billing"])


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",", 1)[0].strip()
    if request.client:
        return request.client.host
    return "127.0.0.1"


def _raise_billing_http_error(
    *,
    exc: Exception,
    operation: str,
    billing_cycle: str,
    unavailable_detail: str,
    failure_detail: str,
) -> NoReturn:
    if isinstance(exc, BillingNotConfiguredError):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=unavailable_detail,
        ) from exc
    if isinstance(exc, BillingValidationError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    if isinstance(exc, AlreadyPremiumError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Você já possui uma assinatura Premium ativa.",
        ) from exc
    if isinstance(exc, BillingSubscriptionNotFoundError):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assinatura não encontrada.",
        ) from exc
    if isinstance(exc, BillingSubscriptionNotCancelableError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Esta assinatura não pode ser cancelada por este usuário.",
        ) from exc
    if isinstance(exc, BillingRateLimitError):
        detail = "Muitas tentativas. Aguarde alguns minutos."
        if exc.retry_after_seconds and exc.retry_after_seconds >= 60:
            minutes = max(1, round(exc.retry_after_seconds / 60))
            detail = f"Muitas tentativas. Tente novamente em cerca de {minutes} min."
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=detail) from exc
    if isinstance(exc, BillingProviderError):
        detail = "Não foi possível processar o pagamento agora. Tente novamente em alguns minutos."
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail) from exc
    if isinstance(exc, BillingServiceError):
        logger.exception(
            "Billing operation failed",
            extra={
                "operation": operation,
                "provider": "asaas",
                "billing_cycle": billing_cycle,
                "error_type": type(exc).__name__,
            },
        )
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=failure_detail) from exc
    logger.exception(
        "Billing failed unexpectedly",
        extra={
            "operation": operation,
            "billing_cycle": billing_cycle,
            "error_type": type(exc).__name__,
        },
    )
    raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=failure_detail) from exc


@router.post("/checkout/subscribe", response_model=CheckoutSubscribeResponse)
async def subscribe_checkout(
    payload: CheckoutSubscribeRequest,
    request: Request,
    billing: BillingDependency,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
) -> CheckoutSubscribeResponse:
    try:
        result = await billing.create_subscription_checkout(
            user_id=user.id,
            user_email=user.email,
            display_name=None,
            billing_cycle=payload.billing_cycle,
            payment_method=payload.payment_method,
            cpf=payload.cpf,
            remote_ip=_client_ip(request),
            card_holder_name=payload.card_holder_name,
            card_number=payload.card_number,
            card_expiry_month=payload.card_expiry_month,
            card_expiry_year=payload.card_expiry_year,
            card_cvv=payload.card_cvv,
            holder_postal_code=payload.holder_postal_code,
            holder_address_number=payload.holder_address_number,
            holder_phone=payload.holder_phone,
        )
    except Exception as exc:
        _raise_billing_http_error(
            exc=exc,
            operation="checkout_subscribe",
            billing_cycle=payload.billing_cycle,
            unavailable_detail="Pagamentos ainda não estão disponíveis.",
            failure_detail="Não foi possível iniciar a assinatura agora.",
        )
    return CheckoutSubscribeResponse.model_validate(result)


@router.get("/checkout/status", response_model=CheckoutStatusResponse)
async def checkout_status(
    billing: BillingDependency,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
) -> CheckoutStatusResponse:
    try:
        result = await billing.get_checkout_status(user_id=user.id)
    except BillingNotConfiguredError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Pagamentos ainda não estão disponíveis.",
        ) from exc
    except BillingProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Não foi possível consultar o pagamento agora.",
        ) from exc
    except BillingServiceError as exc:
        logger.exception(
            "Billing operation failed",
            extra={
                "operation": "checkout_status",
                "provider": "asaas",
                "billing_cycle": "current",
                "error_type": type(exc).__name__,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Não foi possível consultar o pagamento agora.",
        ) from exc
    return CheckoutStatusResponse.model_validate(result)


@router.get("/history", response_model=BillingHistoryResponse)
async def billing_history(
    billing: BillingDependency,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
) -> BillingHistoryResponse:
    try:
        result = await billing.get_billing_history(user_id=user.id)
    except BillingServiceError as exc:
        logger.exception(
            "Billing operation failed",
            extra={
                "operation": "billing_history",
                "provider": "asaas",
                "billing_cycle": "current",
                "error_type": type(exc).__name__,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Não foi possível carregar seu histórico de pagamentos.",
        ) from exc
    return BillingHistoryResponse.model_validate(result)


@router.post("/checkout/resume", response_model=CheckoutStatusResponse)
async def resume_checkout(
    payload: ResumeCheckoutRequest,
    billing: BillingDependency,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
) -> CheckoutStatusResponse:
    try:
        result = await billing.resume_pending_checkout(
            user_id=user.id,
            external_subscription_id=payload.external_subscription_id,
        )
    except Exception as exc:
        _raise_billing_http_error(
            exc=exc,
            operation="checkout_resume",
            billing_cycle="current",
            unavailable_detail="Pagamentos ainda não estão disponíveis.",
            failure_detail="Não foi possível recuperar este pagamento agora.",
        )
    return CheckoutStatusResponse.model_validate(result)


@router.post("/checkout/abandon", response_model=CheckoutStatusResponse)
async def abandon_checkout(
    payload: AbandonCheckoutRequest,
    billing: BillingDependency,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
) -> CheckoutStatusResponse:
    try:
        result = await billing.abandon_pending_checkout(
            user_id=user.id,
            external_subscription_id=payload.external_subscription_id,
        )
    except Exception as exc:
        _raise_billing_http_error(
            exc=exc,
            operation="checkout_abandon",
            billing_cycle="current",
            unavailable_detail="Pagamentos ainda não estão disponíveis.",
            failure_detail="Não foi possível cancelar esta cobrança agora.",
        )
    return CheckoutStatusResponse.model_validate(result)


@router.post("/subscription/cancel", response_model=CancelSubscriptionResponse)
async def cancel_subscription(
    billing: BillingDependency,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
) -> CancelSubscriptionResponse:
    try:
        result = await billing.cancel_subscription(user_id=user.id)
    except Exception as exc:
        _raise_billing_http_error(
            exc=exc,
            operation="subscription_cancel",
            billing_cycle="current",
            unavailable_detail="O cancelamento não está disponível agora.",
            failure_detail="Não foi possível cancelar a assinatura agora.",
        )
    return CancelSubscriptionResponse.model_validate(result)


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
        subscription_started_at=summary.get("subscription_started_at"),
        subscription_ends_at=summary.get("subscription_ends_at"),
        subscription_renews_at=summary.get("subscription_renews_at"),
        billing_cycle=summary.get("billing_cycle"),
        subscription_source=str(summary.get("subscription_source") or "system"),
        payment_method=summary.get("payment_method"),
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
async def asaas_webhook(
    request: Request,
    billing: BillingDependency,
    asaas_access_token: str | None = Header(default=None, alias="asaas-access-token"),
) -> dict[str, Any]:
    try:
        body = await request.json()
    except Exception:
        body = {}
    if not isinstance(body, dict):
        body = {}

    if not billing.verify_webhook_token(asaas_access_token):
        logger.warning(
            "Asaas webhook token rejected",
            extra={"operation": "webhook_verify", "provider": "asaas", "reason": "invalid_token"},
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook token.",
        )

    return await billing.handle_webhook(body)


@router.get("/plans")
async def billing_plans() -> dict[str, Any]:
    from app.services.billing import PRICING

    return {
        "currency": "BRL",
        "plans": {
            "monthly": {"amount": PRICING["monthly"]["amount"], "label": "Mensal"},
            "annual": {
                "amount": PRICING["annual"]["amount"],
                "label": "Anual",
                "savings_label": "Economize 2 meses",
            },
        },
        "payment_methods": ["card", "pix_automatic"],
    }
