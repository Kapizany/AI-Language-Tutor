import base64
import json
from dataclasses import dataclass

import httpx

from app.core.config import Settings
from app.services.providers.common import calculate_cost, parse_json_object


class TranscriptionUnavailableError(RuntimeError):
    pass


class InvalidAudioError(ValueError):
    pass


@dataclass(frozen=True)
class TranscriptionResult:
    transcript: str
    provider: str
    model: str
    input_tokens: int
    output_tokens: int
    estimated_cost_usd: float


class TranscriptionService:
    provider = "gemini"

    def __init__(self, settings: Settings) -> None:
        self.model = settings.gemini_model
        self.api_key = settings.gemini_api_key
        self.input_usd_per_million = settings.gemini_input_usd_per_million
        self.output_usd_per_million = settings.gemini_output_usd_per_million
        self.max_audio_bytes = settings.speech_max_audio_bytes
        self.max_cost_usd = settings.llm_speech_transcription_max_cost_usd
        self.client = httpx.AsyncClient(
            base_url="https://generativelanguage.googleapis.com",
            timeout=settings.llm_request_timeout_seconds,
        )

    @staticmethod
    def validate_audio(audio: bytes, declared_mime_type: str) -> str:
        detected: str | None = None
        if audio.startswith(b"\x1a\x45\xdf\xa3"):
            detected = "audio/webm"
        elif len(audio) >= 12 and audio[4:8] == b"ftyp":
            detected = "audio/mp4"
        elif audio.startswith(b"OggS"):
            detected = "audio/ogg"
        elif audio.startswith(b"RIFF") and audio[8:12] == b"WAVE":
            detected = "audio/wav"
        elif audio.startswith(b"ID3") or (
            len(audio) >= 2 and audio[0] == 0xFF and audio[1] & 0xE0 == 0xE0
        ):
            detected = "audio/mpeg"

        if detected is None or detected != declared_mime_type:
            raise InvalidAudioError("Audio content does not match its declared format")
        return detected

    async def transcribe(
        self,
        *,
        audio: bytes,
        mime_type: str,
        language: str,
    ) -> TranscriptionResult:
        if not self.api_key:
            raise TranscriptionUnavailableError("Gemini API key is not configured")

        language_names = {
            "en": "English",
            "es": "Spanish",
            "fr": "French",
            "it": "Italian",
        }
        try:
            response = await self.client.post(
                f"/v1beta/models/{self.model}:generateContent",
                headers={"x-goog-api-key": self.api_key},
                json={
                    "contents": [
                        {
                            "role": "user",
                            "parts": [
                                {
                                    "text": (
                                        "Transcribe only the spoken words in this audio as "
                                        f"{language_names[language]}. Do not translate, explain, "
                                        "correct, or add punctuation that was not implied. Return "
                                        'JSON exactly as {"transcript":"..."}. If there is no '
                                        'intelligible speech, return {"transcript":""}.'
                                    )
                                },
                                {
                                    "inlineData": {
                                        "mimeType": mime_type,
                                        "data": base64.b64encode(audio).decode("ascii"),
                                    }
                                },
                            ],
                        }
                    ],
                    "generationConfig": {
                        "temperature": 0,
                        "maxOutputTokens": 256,
                        "responseMimeType": "application/json",
                        "responseSchema": {
                            "type": "OBJECT",
                            "properties": {"transcript": {"type": "STRING"}},
                            "required": ["transcript"],
                        },
                    },
                },
            )
            response.raise_for_status()
            payload = response.json()
            raw_text = payload["candidates"][0]["content"]["parts"][0]["text"]
            transcript = str(parse_json_object(raw_text).get("transcript", "")).strip()
            usage = payload.get("usageMetadata", {})
            input_tokens = int(usage.get("promptTokenCount", 0))
            output_tokens = int(usage.get("candidatesTokenCount", 0)) + int(
                usage.get("thoughtsTokenCount", 0)
            )
        except (httpx.HTTPError, KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
            raise TranscriptionUnavailableError("Audio transcription failed") from exc

        return TranscriptionResult(
            transcript=transcript[:2_000],
            provider=self.provider,
            model=self.model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            estimated_cost_usd=calculate_cost(
                input_tokens,
                output_tokens,
                self.input_usd_per_million,
                self.output_usd_per_million,
            ),
        )

    async def close(self) -> None:
        await self.client.aclose()
