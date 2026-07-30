from typing import Annotated, cast

from fastapi import Depends, Request

from app.services.budget import BudgetService
from app.services.gateway import LLMGateway


async def get_gateway(request: Request) -> LLMGateway:
    return cast(LLMGateway, request.app.state.gateway)


async def get_budget_service(request: Request) -> BudgetService:
    return cast(BudgetService, request.app.state.budget_service)


GatewayDependency = Annotated[LLMGateway, Depends(get_gateway)]
BudgetDependency = Annotated[BudgetService, Depends(get_budget_service)]
