from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import httpx
import pytest

from app.api.dependencies import (
    get_account_service,
    get_budget_service,
    get_transcription_service,
)
from app.core.config import Settings
from app.core.security import get_current_user
from app.main import app
from app.schemas.auth import AuthenticatedUser
from app.services.account import AccountService
from app.services.budget import BudgetService
from app.services.gateway import LLMGateway
from app.services.providers.mock import MockProvider
from app.services.transcription import InvalidAudioError, TranscriptionResult, TranscriptionService
from tests.test_gateway import build_gateway


async def authenticated_user() -> AuthenticatedUser:
    return AuthenticatedUser(
        id=UUID("10000000-0000-0000-0000-000000000001"),
        email="learner@example.test",
    )


def build_test_gateway() -> LLMGateway:
    return build_gateway([MockProvider()])


@pytest.mark.asyncio
async def test_health() -> None:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.asyncio
async def test_private_route_requires_authentication() -> None:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get("/api/v1/me")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_authenticated_user_can_delete_account() -> None:
    account_service = AsyncMock(spec=AccountService)

    async def configured_account_service() -> AccountService:
        return account_service

    app.dependency_overrides[get_current_user] = authenticated_user
    app.dependency_overrides[get_account_service] = configured_account_service
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            response = await client.request(
                "DELETE",
                "/api/v1/account",
                json={"confirmation": "EXCLUIR"},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 204
    account_service.delete_user.assert_awaited_once_with(
        UUID("10000000-0000-0000-0000-000000000001")
    )


@pytest.mark.asyncio
async def test_account_deletion_requires_exact_confirmation() -> None:
    account_service = AsyncMock(spec=AccountService)

    async def configured_account_service() -> AccountService:
        return account_service

    app.dependency_overrides[get_current_user] = authenticated_user
    app.dependency_overrides[get_account_service] = configured_account_service
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            response = await client.request(
                "DELETE",
                "/api/v1/account",
                json={"confirmation": "excluir"},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 422
    account_service.delete_user.assert_not_awaited()


@pytest.mark.asyncio
async def test_mock_tutor_reply() -> None:
    budget = BudgetService(Settings(_env_file=None))
    app.state.gateway = build_test_gateway()
    app.state.budget_service = budget
    app.dependency_overrides[get_current_user] = authenticated_user
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            response = await client.post(
                "/api/v1/ai/tutor/reply",
                json={
                    "message": "Hello",
                    "target_language": "en",
                    "learner_level": "A1",
                    "scenario": "coffee",
                    "request_id": str(uuid4()),
                },
            )
    finally:
        app.dependency_overrides.clear()
        await budget.close()

    assert response.status_code == 200
    assert response.json()["usage"]["provider"] == "mock"
    assert response.json()["usage"]["estimated_cost_usd"] == 0


@pytest.mark.asyncio
async def test_authenticated_user_can_transcribe_short_audio() -> None:
    transcription = AsyncMock(spec=TranscriptionService)
    transcription.provider = "gemini"
    transcription.model = "gemini-3.1-flash-lite"
    transcription.max_audio_bytes = 3_000_000
    transcription.max_cost_usd = 0.01
    transcription.validate_audio = MagicMock(return_value="audio/webm")
    transcription.transcribe.return_value = TranscriptionResult(
        transcript="Hello, how are you?",
        provider="gemini",
        model="gemini-3.1-flash-lite",
        input_tokens=320,
        output_tokens=8,
        estimated_cost_usd=0.000092,
    )
    budget = AsyncMock(spec=BudgetService)

    async def configured_transcription() -> TranscriptionService:
        return transcription

    async def configured_budget() -> BudgetService:
        return budget

    app.dependency_overrides[get_current_user] = authenticated_user
    app.dependency_overrides[get_transcription_service] = configured_transcription
    app.dependency_overrides[get_budget_service] = configured_budget
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            response = await client.post(
                f"/api/v1/speech/transcribe?language=en&request_id={uuid4()}",
                content=b"\x1a\x45\xdf\xa3" + b"a" * 996,
                headers={"Content-Type": "audio/webm"},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["transcript"] == "Hello, how are you?"
    transcription.transcribe.assert_awaited_once()
    budget.authorize_transcription.assert_awaited_once()
    budget.reserve.assert_awaited_once()
    budget.finalize.assert_awaited_once()


@pytest.mark.asyncio
async def test_transcription_rejects_oversized_audio_before_model_call() -> None:
    transcription = AsyncMock(spec=TranscriptionService)
    transcription.max_audio_bytes = 100
    budget = AsyncMock(spec=BudgetService)

    async def configured_transcription() -> TranscriptionService:
        return transcription

    async def configured_budget() -> BudgetService:
        return budget

    app.dependency_overrides[get_current_user] = authenticated_user
    app.dependency_overrides[get_transcription_service] = configured_transcription
    app.dependency_overrides[get_budget_service] = configured_budget
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            response = await client.post(
                f"/api/v1/speech/transcribe?language=en&request_id={uuid4()}",
                content=b"a" * 101,
                headers={"Content-Type": "audio/webm"},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 413
    transcription.transcribe.assert_not_awaited()
    budget.reserve.assert_not_awaited()


@pytest.mark.asyncio
async def test_transcription_rejects_spoofed_audio_before_model_call() -> None:
    transcription = AsyncMock(spec=TranscriptionService)
    transcription.max_audio_bytes = 500_000
    transcription.validate_audio = MagicMock(side_effect=InvalidAudioError("invalid audio"))
    budget = AsyncMock(spec=BudgetService)

    async def configured_transcription() -> TranscriptionService:
        return transcription

    async def configured_budget() -> BudgetService:
        return budget

    app.dependency_overrides[get_current_user] = authenticated_user
    app.dependency_overrides[get_transcription_service] = configured_transcription
    app.dependency_overrides[get_budget_service] = configured_budget
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            response = await client.post(
                f"/api/v1/speech/transcribe?language=en&request_id={uuid4()}",
                content=b"not-a-real-webm" * 20,
                headers={"Content-Type": "audio/webm"},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 422
    transcription.transcribe.assert_not_awaited()
    budget.reserve.assert_not_awaited()
