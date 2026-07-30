import time
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.dependencies import BudgetDependency, GatewayDependency
from app.core.security import get_current_user
from app.schemas.auth import AuthenticatedUser
from app.schemas.llm import TutorReplyRequest, TutorReplyResponse, UsageSummary
from app.services.budget import BudgetExceededError
from app.services.gateway import GatewayUnavailableError

router = APIRouter(prefix="/api/v1/ai", tags=["ai"])


@router.post("/tutor/reply", response_model=TutorReplyResponse)
async def tutor_reply(
    payload: TutorReplyRequest,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    gateway: GatewayDependency,
    budget: BudgetDependency,
) -> TutorReplyResponse:
    primary = gateway.providers[0]
    try:
        await budget.reserve(
            user_id=user.id,
            request_id=payload.request_id,
            feature="tutor_reply",
            provider=primary.name,
            model=primary.model,
            estimated_max_cost_usd=budget.max_request_cost_usd,
        )
    except BudgetExceededError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc

    started_at = time.monotonic()
    try:
        provider_result = await gateway.generate_tutor_reply(payload)
    except GatewayUnavailableError as exc:
        latency_ms = round((time.monotonic() - started_at) * 1_000)
        await budget.finalize(
            request_id=payload.request_id,
            status="failed",
            provider=primary.name,
            model=primary.model,
            latency_ms=latency_ms,
            error_code="gateway_unavailable",
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The tutor is temporarily unavailable.",
        ) from exc

    latency_ms = round((time.monotonic() - started_at) * 1_000)
    await budget.finalize(
        request_id=payload.request_id,
        status="succeeded",
        provider=provider_result.provider,
        model=provider_result.model,
        input_tokens=provider_result.input_tokens,
        output_tokens=provider_result.output_tokens,
        estimated_cost_usd=provider_result.estimated_cost_usd,
        latency_ms=latency_ms,
    )
    return TutorReplyResponse(
        request_id=payload.request_id,
        result=provider_result.result,
        usage=UsageSummary(
            provider=provider_result.provider,
            model=provider_result.model,
            input_tokens=provider_result.input_tokens,
            output_tokens=provider_result.output_tokens,
            estimated_cost_usd=provider_result.estimated_cost_usd,
            latency_ms=latency_ms,
        ),
    )
