from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import account, ai, health
from app.core.config import get_settings
from app.services.account import AccountService
from app.services.budget import BudgetService
from app.services.provider_factory import build_gateway


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    app.state.gateway = build_gateway(settings)
    app.state.budget_service = BudgetService(settings)
    app.state.account_service = AccountService(settings)
    yield
    await app.state.gateway.close()
    await app.state.budget_service.close()
    await app.state.account_service.close()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Lume Tutor API",
        version="0.1.0",
        docs_url="/docs" if settings.app_env != "production" else None,
        redoc_url=None,
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.app_allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )
    app.include_router(health.router)
    app.include_router(account.router)
    app.include_router(ai.router)
    return app


app = create_app()
