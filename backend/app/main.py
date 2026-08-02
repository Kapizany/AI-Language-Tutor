import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import RequestResponseEndpoint
from starlette.responses import Response

from app.api.routes import account, admin, ai, billing, conversation, health, speech
from app.core.config import get_settings
from app.core.logging import bind_request_context, configure_logging, reset_request_context
from app.services.account import AccountService
from app.services.admin import AdminService
from app.services.auth import AuthUserVerifier
from app.services.billing import BillingService
from app.services.budget import BudgetService
from app.services.conversation import ConversationService
from app.services.entitlements import EntitlementService
from app.services.provider_factory import build_gateway
from app.services.transcription import TranscriptionService

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging()
    app.state.gateway = build_gateway(settings)
    app.state.auth_user_verifier = AuthUserVerifier(settings)
    app.state.budget_service = BudgetService(settings)
    app.state.account_service = AccountService(settings)
    app.state.entitlement_service = EntitlementService(settings)
    app.state.admin_service = AdminService(settings)
    app.state.billing_service = BillingService(settings)
    app.state.conversation_service = ConversationService(settings)
    app.state.transcription_service = TranscriptionService(settings)
    yield
    await app.state.auth_user_verifier.close()
    await app.state.gateway.close()
    await app.state.budget_service.close()
    await app.state.account_service.close()
    await app.state.entitlement_service.close()
    await app.state.admin_service.close()
    await app.state.billing_service.close()
    await app.state.conversation_service.close()
    await app.state.transcription_service.close()


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
        allow_methods=["GET", "POST", "DELETE", "PATCH"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @app.middleware("http")
    async def security_headers(request: Request, call_next: RequestResponseEndpoint) -> Response:
        request_id = request.headers.get("x-request-id") or str(uuid4())
        cloud_trace = request.headers.get("x-cloud-trace-context", "")
        trace_id = cloud_trace.split("/", 1)[0]
        context_tokens = bind_request_context(request_id, trace_id)
        try:
            response = await call_next(request)
        except Exception as exc:
            logger.exception(
                "Unhandled request exception",
                extra={
                    "operation": "http_request",
                    "http_method": request.method,
                    "http_path": request.url.path,
                    "error_type": type(exc).__name__,
                },
            )
            raise
        finally:
            reset_request_context(context_tokens)
        response.headers["X-Request-ID"] = request_id
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
    app.include_router(admin.router)
    app.include_router(billing.router)
    app.include_router(ai.router)
    app.include_router(conversation.router)
    app.include_router(speech.router)
    return app


app = create_app()
