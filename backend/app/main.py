from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import RequestResponseEndpoint
from starlette.responses import Response

from app.api.routes import account, ai, conversation, health
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.services.account import AccountService
from app.services.budget import BudgetService
from app.services.conversation import ConversationService
from app.services.provider_factory import build_gateway


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging()
    app.state.gateway = build_gateway(settings)
    app.state.budget_service = BudgetService(settings)
    app.state.account_service = AccountService(settings)
    app.state.conversation_service = ConversationService(settings)
    yield
    await app.state.gateway.close()
    await app.state.budget_service.close()
    await app.state.account_service.close()
    await app.state.conversation_service.close()


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
        allow_credentials=False,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @app.middleware("http")
    async def security_headers(request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Cache-Control"] = "no-store"
        if settings.app_env == "production":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
            response.headers["Content-Security-Policy"] = (
                "default-src 'none'; frame-ancestors 'none'"
            )
        return response

    app.include_router(health.router)
    app.include_router(account.router)
    app.include_router(ai.router)
    app.include_router(conversation.router)
    return app


app = create_app()
