from app.services.speech_providers.base import SpeechProvider, SynthesisRequest, SynthesisResult

# Minimal MP3 frame for deterministic tests.
_MOCK_MP3 = bytes.fromhex("fff360c400000000000000000000000000000000000000000000000000000000000000")


class MockSpeechProvider(SpeechProvider):
    name = "mock"

    async def synthesize(self, request: SynthesisRequest) -> SynthesisResult:
        return SynthesisResult(
            audio=_MOCK_MP3,
            content_type="audio/mpeg",
            provider=self.name,
            voice=request.voice_name,
            character_count=len(request.text),
            estimated_cost_usd=0.0,
        )
