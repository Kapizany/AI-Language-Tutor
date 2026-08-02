import base64

import httpx

from app.core.config import Settings
from app.services.google_auth import fetch_google_access_token
from app.services.speech_providers.base import SpeechProvider, SynthesisRequest, SynthesisResult


class SynthesisUnavailableError(RuntimeError):
    pass


class GoogleStandardSpeechProvider(SpeechProvider):
    name = "google_standard"

    def __init__(self, settings: Settings) -> None:
        self.access_token = settings.google_access_token.strip()
        self.usd_per_million_characters = settings.speech_synthesis_usd_per_million_characters
        self.client = httpx.AsyncClient(
            base_url="https://texttospeech.googleapis.com",
            timeout=settings.llm_request_timeout_seconds,
        )

    async def _resolve_access_token(self) -> str:
        if self.access_token:
            return self.access_token
        token = await fetch_google_access_token(self.client)
        if not token:
            raise SynthesisUnavailableError("Google Cloud credentials are not configured")
        return token

    async def synthesize(self, request: SynthesisRequest) -> SynthesisResult:
        access_token = await self._resolve_access_token()
        try:
            response = await self.client.post(
                "/v1/text:synthesize",
                headers={"Authorization": f"Bearer {access_token}"},
                json={
                    "input": {"text": request.text},
                    "voice": {
                        "languageCode": request.language_code,
                        "name": request.voice_name,
                    },
                    "audioConfig": {
                        "audioEncoding": "MP3",
                        "speakingRate": request.speaking_rate,
                    },
                },
            )
            response.raise_for_status()
            payload = response.json()
            audio = base64.b64decode(str(payload["audioContent"]))
        except (httpx.HTTPError, KeyError, TypeError, ValueError) as exc:
            raise SynthesisUnavailableError("Google Standard TTS synthesis failed") from exc

        character_count = len(request.text)
        return SynthesisResult(
            audio=audio,
            content_type="audio/mpeg",
            provider=self.name,
            voice=request.voice_name,
            character_count=character_count,
            estimated_cost_usd=(character_count / 1_000_000) * self.usd_per_million_characters,
        )

    async def close(self) -> None:
        await self.client.aclose()
