from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass(frozen=True)
class SynthesisRequest:
    text: str
    language_code: str
    voice_name: str
    speaking_rate: float


@dataclass(frozen=True)
class SynthesisResult:
    audio: bytes
    content_type: str
    provider: str
    voice: str
    character_count: int
    estimated_cost_usd: float


class SpeechProvider(ABC):
    name: str

    @abstractmethod
    async def synthesize(self, request: SynthesisRequest) -> SynthesisResult:
        """Return synthesized audio bytes."""

    async def close(self) -> None:
        return None
