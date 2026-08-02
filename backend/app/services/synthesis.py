import base64
import hashlib
import logging
import re
from collections import OrderedDict
from dataclasses import dataclass

import httpx

from app.core.config import Settings
from app.services.speech_providers.base import SpeechProvider, SynthesisRequest, SynthesisResult
from app.services.speech_providers.google_standard import (
    GoogleStandardSpeechProvider,
    SynthesisUnavailableError,
)
from app.services.speech_providers.mock import MockSpeechProvider

logger = logging.getLogger(__name__)


class InvalidSynthesisTextError(ValueError):
    pass


@dataclass(frozen=True)
class CachedSynthesis:
    audio: bytes
    content_type: str
    provider: str
    voice: str
    character_count: int


class SpeechSynthesisService:
    LANGUAGE_VOICES: dict[str, tuple[str, str]] = {
        "en": ("en-US", "en-US-Standard-C"),
        "es": ("es-ES", "es-ES-Standard-A"),
        "fr": ("fr-FR", "fr-FR-Standard-A"),
        "it": ("it-IT", "it-IT-Standard-A"),
    }

    def __init__(self, settings: Settings) -> None:
        self.provider_name = settings.speech_synthesis_provider
        self.provider_version = settings.speech_synthesis_cache_version
        self.max_text_length = settings.speech_synthesis_max_text_length
        self.max_cost_usd = settings.speech_synthesis_max_cost_usd
        self.enabled = settings.speech_synthesis_enabled
        self.memory_cache_size = max(0, settings.speech_synthesis_memory_cache_size)
        self.provider: SpeechProvider = self._build_provider(settings)
        self._memory_cache: OrderedDict[str, CachedSynthesis] = OrderedDict()
        self.db = httpx.AsyncClient(
            base_url=(
                f"{settings.supabase_url.rstrip('/')}/rest/v1"
                if settings.supabase_url
                else "http://localhost"
            ),
            timeout=10,
            headers={
                "apikey": settings.supabase_service_role_key,
                "Authorization": f"Bearer {settings.supabase_service_role_key}",
                "Content-Type": "application/json",
            },
        )
        self.cache_enabled = bool(settings.supabase_url and settings.supabase_service_role_key)

    @staticmethod
    def _build_provider(settings: Settings) -> SpeechProvider:
        if settings.speech_synthesis_provider == "mock":
            return MockSpeechProvider()
        if settings.app_env != "production" and not settings.google_access_token.strip():
            return MockSpeechProvider()
        return GoogleStandardSpeechProvider(settings)

    @staticmethod
    def normalize_text(text: str) -> str:
        normalized = re.sub(r"\s+", " ", text.strip())
        if not normalized:
            raise InvalidSynthesisTextError("Text is empty")
        return normalized

    @staticmethod
    def normalize_speaking_rate(speaking_rate: float) -> float:
        if speaking_rate <= 0.9:
            return 0.85
        return 1.0

    def resolve_voice(self, language: str) -> tuple[str, str]:
        try:
            return self.LANGUAGE_VOICES[language]
        except KeyError as exc:
            raise InvalidSynthesisTextError("Unsupported language") from exc

    def cache_key(self, *, text: str, language: str, speaking_rate: float) -> str:
        language_code, voice_name = self.resolve_voice(language)
        payload = "|".join(
            [
                self.provider_name,
                self.provider_version,
                language,
                language_code,
                voice_name,
                f"{speaking_rate:.2f}",
                text,
            ]
        )
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    def _memory_get(self, cache_key: str) -> CachedSynthesis | None:
        if self.memory_cache_size <= 0:
            return None
        cached = self._memory_cache.get(cache_key)
        if cached is None:
            return None
        self._memory_cache.move_to_end(cache_key)
        return cached

    def _memory_put(self, cache_key: str, cached: CachedSynthesis) -> None:
        if self.memory_cache_size <= 0:
            return
        self._memory_cache[cache_key] = cached
        self._memory_cache.move_to_end(cache_key)
        while len(self._memory_cache) > self.memory_cache_size:
            self._memory_cache.popitem(last=False)

    async def load_cache(self, cache_key: str) -> CachedSynthesis | None:
        memory_hit = self._memory_get(cache_key)
        if memory_hit is not None:
            return memory_hit

        if not self.cache_enabled:
            return None

        try:
            response = await self.client_post_rpc(
                "/rpc/get_speech_synthesis_cache",
                {"p_cache_key": cache_key},
            )
            payload = response.json()
        except (httpx.HTTPError, ValueError, TypeError) as exc:
            logger.warning(
                "Speech synthesis cache read failed",
                extra={"operation": "speech_cache_read", "error_type": type(exc).__name__},
            )
            return None

        if not isinstance(payload, dict) or not payload.get("found"):
            return None
        audio_base64 = payload.get("audio_base64")
        if not isinstance(audio_base64, str):
            return None

        try:
            cached = CachedSynthesis(
                audio=base64.b64decode(audio_base64),
                content_type=str(payload.get("content_type") or "audio/mpeg"),
                provider=str(payload.get("provider") or self.provider_name),
                voice=str(payload.get("voice") or ""),
                character_count=int(payload.get("character_count") or 0),
            )
        except (ValueError, TypeError):
            return None

        self._memory_put(cache_key, cached)
        return cached

    async def store_cache(
        self,
        *,
        cache_key: str,
        result: SynthesisResult,
        speaking_rate: float,
    ) -> None:
        cached = CachedSynthesis(
            audio=result.audio,
            content_type=result.content_type,
            provider=result.provider,
            voice=result.voice,
            character_count=result.character_count,
        )
        self._memory_put(cache_key, cached)

        if not self.cache_enabled:
            return
        try:
            await self.client_post_rpc(
                "/rpc/store_speech_synthesis_cache",
                {
                    "p_cache_key": cache_key,
                    "p_audio_base64": base64.b64encode(result.audio).decode("ascii"),
                    "p_content_type": result.content_type,
                    "p_provider": result.provider,
                    "p_voice": result.voice,
                    "p_speaking_rate": speaking_rate,
                    "p_provider_version": self.provider_version,
                    "p_character_count": result.character_count,
                },
            )
        except (httpx.HTTPError, ValueError, TypeError) as exc:
            logger.warning(
                "Speech synthesis cache write failed",
                extra={"operation": "speech_cache_write", "error_type": type(exc).__name__},
            )

    async def get_cached(
        self,
        *,
        text: str,
        language: str,
        speaking_rate: float,
    ) -> CachedSynthesis | None:
        normalized_text = self.normalize_text(text)
        if len(normalized_text) > self.max_text_length:
            raise InvalidSynthesisTextError("Text is too long")
        normalized_rate = self.normalize_speaking_rate(speaking_rate)
        return await self.load_cache(
            self.cache_key(
                text=normalized_text,
                language=language,
                speaking_rate=normalized_rate,
            )
        )

    async def synthesize(
        self,
        *,
        text: str,
        language: str,
        speaking_rate: float,
        use_cache: bool = True,
    ) -> tuple[SynthesisResult, bool]:
        if not self.enabled:
            raise SynthesisUnavailableError("Speech synthesis is disabled")

        normalized_text = self.normalize_text(text)
        if len(normalized_text) > self.max_text_length:
            raise InvalidSynthesisTextError("Text is too long")

        normalized_rate = self.normalize_speaking_rate(speaking_rate)
        cache_key = self.cache_key(
            text=normalized_text,
            language=language,
            speaking_rate=normalized_rate,
        )

        if use_cache:
            cached = await self.load_cache(cache_key)
            if cached is not None:
                return (
                    SynthesisResult(
                        audio=cached.audio,
                        content_type=cached.content_type,
                        provider=cached.provider,
                        voice=cached.voice,
                        character_count=cached.character_count or len(normalized_text),
                        estimated_cost_usd=0.0,
                    ),
                    True,
                )

        language_code, voice_name = self.resolve_voice(language)
        result = await self.provider.synthesize(
            SynthesisRequest(
                text=normalized_text,
                language_code=language_code,
                voice_name=voice_name,
                speaking_rate=normalized_rate,
            )
        )
        await self.store_cache(cache_key=cache_key, result=result, speaking_rate=normalized_rate)
        return result, False

    async def client_post_rpc(self, path: str, payload: dict[str, object]) -> httpx.Response:
        response = await self.db.post(path, json=payload)
        response.raise_for_status()
        return response

    @property
    def model(self) -> str:
        if isinstance(self.provider, GoogleStandardSpeechProvider):
            return "standard"
        return self.provider.name

    async def close(self) -> None:
        await self.provider.close()
        await self.db.aclose()
