from abc import ABC, abstractmethod
from dataclasses import dataclass

from app.schemas.llm import TutorReply, TutorReplyRequest


@dataclass(frozen=True)
class ProviderResult:
    result: TutorReply
    provider: str
    model: str
    input_tokens: int
    output_tokens: int
    estimated_cost_usd: float


class LLMProvider(ABC):
    name: str
    model: str

    @abstractmethod
    async def generate_tutor_reply(self, request: TutorReplyRequest) -> ProviderResult:
        """Generate and validate one structured tutor reply."""
