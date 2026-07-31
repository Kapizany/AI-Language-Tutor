from typing import Annotated, cast

from fastapi import Depends, Request

from app.services.account import AccountService
from app.services.budget import BudgetService
from app.services.conversation import ConversationService
from app.services.gateway import LLMGateway
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


GatewayDependency = Annotated[LLMGateway, Depends(get_gateway)]
BudgetDependency = Annotated[BudgetService, Depends(get_budget_service)]
AccountDependency = Annotated[AccountService, Depends(get_account_service)]
ConversationDependency = Annotated[ConversationService, Depends(get_conversation_service)]
TranscriptionDependency = Annotated[TranscriptionService, Depends(get_transcription_service)]
