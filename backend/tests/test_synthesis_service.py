from unittest.mock import AsyncMock
from uuid import uuid4

import httpx
import pytest

from app.api.dependencies import get_budget_service, get_synthesis_service
from app.core.config import Settings
from app.core.security import get_current_user
from app.main import app
from app.services.budget import PremiumRequiredError
from app.services.speech_providers.base import SynthesisResult
from app.services.speech_providers.mock import MockSpeechProvider
from app.services.synthesis import (
    CachedSynthesis,
    InvalidSynthesisTextError,
    SpeechSynthesisService,
)
from tests.test_api import authenticated_user


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("  Hello   world  ", "Hello world"),
        ("Bonjour", "Bonjour"),
    ],
)
def test_normalize_text(raw: str, expected: str) -> None:
    assert SpeechSynthesisService.normalize_text(raw) == expected


def test_normalize_text_rejects_empty() -> None:
    with pytest.raises(InvalidSynthesisTextError):
        SpeechSynthesisService.normalize_text("   ")


@pytest.mark.parametrize(
    ("rate", "expected"),
    [
        (1.0, 1.0),
        (0.85, 0.85),
        (0.75, 0.85),
    ],
)
def test_normalize_speaking_rate(rate: float, expected: float) -> None:
    assert SpeechSynthesisService.normalize_speaking_rate(rate) == expected


def test_cache_key_is_stable() -> None:
    service = SpeechSynthesisService.__new__(SpeechSynthesisService)
    service.provider_name = "mock"
    service.provider_version = "test-v1"
    first = service.cache_key(text="Hello", language="en", speaking_rate=1.0)
    second = service.cache_key(text="Hello", language="en", speaking_rate=1.0)
    third = service.cache_key(text="Hello", language="en", speaking_rate=0.85)
    assert first == second
    assert first != third


@pytest.mark.asyncio
async def test_memory_cache_avoids_provider_on_second_call() -> None:
    settings = Settings(
        _env_file=None,
        speech_synthesis_provider="mock",
        speech_synthesis_memory_cache_size=8,
        supabase_url="",
        supabase_service_role_key="",
    )
    service = SpeechSynthesisService(settings)
    provider = AsyncMock(spec=MockSpeechProvider)
    provider.synthesize = AsyncMock(
        return_value=SynthesisResult(
            audio=b"cached-audio",
            content_type="audio/mpeg",
            provider="mock",
            voice="en-US-Standard-C",
            character_count=5,
            estimated_cost_usd=0.0,
        )
    )
    service.provider = provider

    first, first_cached = await service.synthesize(text="Hello", language="en", speaking_rate=1.0)
    second, second_cached = await service.synthesize(text="Hello", language="en", speaking_rate=1.0)
    await service.close()

    assert first.audio == b"cached-audio"
    assert first_cached is False
    assert second.audio == b"cached-audio"
    assert second_cached is True
    provider.synthesize.assert_awaited_once()


@pytest.mark.asyncio
async def test_db_cache_failure_does_not_break_synthesis() -> None:
    settings = Settings(
        _env_file=None,
        speech_synthesis_provider="mock",
        speech_synthesis_memory_cache_size=0,
        supabase_url="https://example.supabase.co",
        supabase_service_role_key="service-role",
    )
    service = SpeechSynthesisService(settings)
    service.db = AsyncMock()
    service.db.post = AsyncMock(side_effect=httpx.ConnectError("offline"))
    service.db.aclose = AsyncMock()

    result, cached = await service.synthesize(text="Hello", language="en", speaking_rate=1.0)
    await service.close()

    assert result.audio
    assert cached is False


@pytest.mark.asyncio
async def test_synthesize_endpoint_requires_premium() -> None:
    synthesis = AsyncMockSynthesis()
    budget = AsyncMock()
    budget.authorize_synthesis = AsyncMock(
        side_effect=PremiumRequiredError("Premium plan required for text-to-speech")
    )

    async def configured_synthesis() -> AsyncMockSynthesis:
        return synthesis

    async def configured_budget() -> AsyncMock:
        return budget

    app.dependency_overrides[get_current_user] = authenticated_user
    app.dependency_overrides[get_synthesis_service] = configured_synthesis
    app.dependency_overrides[get_budget_service] = configured_budget
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            response = await client.post(
                "/api/v1/speech/synthesize",
                json={
                    "text": "Hello there",
                    "language": "en",
                    "speaking_rate": 1,
                    "request_id": str(uuid4()),
                },
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 403
    assert "Premium" in response.json()["detail"]


@pytest.mark.asyncio
async def test_synthesize_endpoint_returns_audio_for_premium_user() -> None:
    synthesis = AsyncMockSynthesis()
    budget = AsyncMock()
    budget.authorize_synthesis = AsyncMock(return_value=None)
    budget.reserve = AsyncMock(return_value=None)
    budget.finalize = AsyncMock(return_value=None)

    async def configured_synthesis() -> AsyncMockSynthesis:
        return synthesis

    async def configured_budget() -> AsyncMock:
        return budget

    app.dependency_overrides[get_current_user] = authenticated_user
    app.dependency_overrides[get_synthesis_service] = configured_synthesis
    app.dependency_overrides[get_budget_service] = configured_budget
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            response = await client.post(
                "/api/v1/speech/synthesize",
                json={
                    "text": "Hello there",
                    "language": "en",
                    "speaking_rate": 1,
                    "request_id": str(uuid4()),
                },
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("audio/")
    assert response.headers["x-speech-cached"] == "0"
    assert response.content == b"mock-audio"
    budget.authorize_synthesis.assert_awaited_once()
    assert budget.authorize_synthesis.await_args.kwargs["meter_usage"] is True
    budget.reserve.assert_awaited_once()
    budget.finalize.assert_awaited_once()


@pytest.mark.asyncio
async def test_synthesize_endpoint_cache_hit_skips_budget_reserve() -> None:
    synthesis = AsyncMockSynthesis(cached=True)
    budget = AsyncMock()
    budget.authorize_synthesis = AsyncMock(return_value=None)
    budget.reserve = AsyncMock(return_value=None)
    budget.finalize = AsyncMock(return_value=None)

    async def configured_synthesis() -> AsyncMockSynthesis:
        return synthesis

    async def configured_budget() -> AsyncMock:
        return budget

    app.dependency_overrides[get_current_user] = authenticated_user
    app.dependency_overrides[get_synthesis_service] = configured_synthesis
    app.dependency_overrides[get_budget_service] = configured_budget
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            response = await client.post(
                "/api/v1/speech/synthesize",
                json={
                    "text": "Hello there",
                    "language": "en",
                    "speaking_rate": 1,
                    "request_id": str(uuid4()),
                },
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.headers["x-speech-cached"] == "1"
    assert response.content == b"cached-audio"
    budget.authorize_synthesis.assert_awaited_once()
    assert budget.authorize_synthesis.await_args.kwargs["meter_usage"] is False
    budget.reserve.assert_not_awaited()
    budget.finalize.assert_not_awaited()


class AsyncMockSynthesis:
    provider_name = "mock"
    model = "mock"
    max_cost_usd = 0.005

    def __init__(self, *, cached: bool = False) -> None:
        self.cached = cached

    def normalize_text(self, text: str) -> str:
        return SpeechSynthesisService.normalize_text(text)

    def normalize_speaking_rate(self, speaking_rate: float) -> float:
        return SpeechSynthesisService.normalize_speaking_rate(speaking_rate)

    def cache_key(self, *, text: str, language: str, speaking_rate: float) -> str:
        return "cache-key"

    async def get_cached(self, *, text: str, language: str, speaking_rate: float):
        if not self.cached:
            return None
        return CachedSynthesis(
            audio=b"cached-audio",
            content_type="audio/mpeg",
            provider="mock",
            voice="mock-voice",
            character_count=len(text),
        )

    async def load_cache(self, cache_key: str) -> CachedSynthesis | None:
        return None

    async def synthesize(
        self,
        *,
        text: str,
        language: str,
        speaking_rate: float,
        use_cache: bool = True,
    ) -> tuple[SynthesisResult, bool]:
        return (
            SynthesisResult(
                audio=b"mock-audio",
                content_type="audio/mpeg",
                provider="mock",
                voice="mock-voice",
                character_count=len(text),
                estimated_cost_usd=0.0,
            ),
            False,
        )
