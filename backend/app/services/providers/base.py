from abc import ABC, abstractmethod
from dataclasses import dataclass

from app.schemas.llm import LLMTask


@dataclass(frozen=True)
class CompletionRequest:
    """Uma chamada genérica ao provedor.

    O gateway monta os prompts e valida a resposta, então adicionar uma nova
    tarefa de IA não exige alterar nenhum adaptador de provedor.
    """

    task: LLMTask
    system_prompt: str
    user_prompt: str
    max_output_tokens: int
    temperature: float


@dataclass(frozen=True)
class CompletionResult:
    content: str
    input_tokens: int
    output_tokens: int
    estimated_cost_usd: float


class LLMProvider(ABC):
    name: str
    model: str

    @abstractmethod
    async def complete(self, request: CompletionRequest) -> CompletionResult:
        """Return the raw JSON text produced by the provider."""

    async def close(self) -> None:
        return None
