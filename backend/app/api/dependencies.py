from typing import Annotated, cast

from fastapi import Depends, HTTPException, Request, status

from app.core.security import get_current_user
from app.schemas.auth import AuthenticatedUser
from app.services.account import AccountService
from app.services.admin import AdminService
from app.services.billing import BillingService
from app.services.budget import BudgetService
from app.services.conversation import ConversationService
from app.services.entitlements import EntitlementService
from app.services.gateway import LLMGateway
from app.services.synthesis import SpeechSynthesisService
from app.services.transcription import TranscriptionService


async def get_gateway(request: Request) -> LLMGateway:
    return cast(LLMGateway, request.app.state.gateway)


async def get_budget_service(request: Request) -> BudgetService:
    return cast(BudgetService, request.app.state.budget_service)


async def get_account_service(request: Request) -> AccountService:
    return cast(AccountService, request.app.state.account_service)


async def get_conversation_service(request: Request) -> ConversationService:
    return cast(ConversationService, request.app.state.conversation_service)


async def get_transcription_service(request: Request) -> TranscriptionService:
    return cast(TranscriptionService, request.app.state.transcription_service)


async def get_synthesis_service(request: Request) -> SpeechSynthesisService:
    return cast(SpeechSynthesisService, request.app.state.synthesis_service)


async def get_entitlement_service(request: Request) -> EntitlementService:
    return cast(EntitlementService, request.app.state.entitlement_service)


async def get_billing_service(request: Request) -> BillingService:
    return cast(BillingService, request.app.state.billing_service)


async def get_admin_service(request: Request) -> AdminService:
    return cast(AdminService, request.app.state.admin_service)


async def get_admin_user(
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    entitlements: Annotated[EntitlementService, Depends(get_entitlement_service)],
) -> AuthenticatedUser:
    try:
        is_admin = await entitlements.is_admin(user.id)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Admin authorization is temporarily unavailable.",
        ) from exc
    if not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required.",
        )
    return user


GatewayDependency = Annotated[LLMGateway, Depends(get_gateway)]
BudgetDependency = Annotated[BudgetService, Depends(get_budget_service)]
AccountDependency = Annotated[AccountService, Depends(get_account_service)]
ConversationDependency = Annotated[ConversationService, Depends(get_conversation_service)]
TranscriptionDependency = Annotated[TranscriptionService, Depends(get_transcription_service)]
SynthesisDependency = Annotated[SpeechSynthesisService, Depends(get_synthesis_service)]
EntitlementDependency = Annotated[EntitlementService, Depends(get_entitlement_service)]
AdminDependency = Annotated[AdminService, Depends(get_admin_service)]
BillingDependency = Annotated[BillingService, Depends(get_billing_service)]
AdminUserDependency = Annotated[AuthenticatedUser, Depends(get_admin_user)]
