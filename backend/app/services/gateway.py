import asyncio
import json
import logging
import time
from collections.abc import Mapping
from dataclasses import dataclass

from pydantic import BaseModel, ValidationError

from app.schemas.llm import LLMTask
from app.services.providers.base import CompletionRequest, LLMProvider
from app.services.providers.common import parse_json_object

logger = logging.getLogger(__name__)


class GatewayUnavailableError(RuntimeError):
    pass


class InvalidStructuredResponseError(RuntimeError):
    """O provedor respondeu fora do schema. Tratado como falha para acionar retry."""


@dataclass
class CircuitState:
    failures: int = 0
    opened_at: float | None = None


@dataclass(frozen=True)
class TaskProfile:
    """Configuração por tarefa: provedores, tamanho da resposta e teto de custo."""

    providers: tuple[str, ...]
    max_output_tokens: int
    temperature: float
    max_cost_usd: float


@dataclass(frozen=True)
class GatewayResult[OutputModel: BaseModel]:
    result: OutputModel
    provider: str
    model: str
    input_tokens: int
    output_tokens: int
    estimated_cost_usd: float


class LLMGateway:
    def __init__(
        self,
        providers: Mapping[str, LLMProvider],
        task_profiles: Mapping[LLMTask, TaskProfile],
        *,
        max_retries: int,
        failure_threshold: int,
        recovery_seconds: int,
    ) -> None:
        if not providers:
            raise ValueError("At least one LLM provider is required")
        self.providers = dict(providers)
        self.task_profiles = dict(task_profiles)
        for task, profile in self.task_profiles.items():
            if not profile.providers:
                raise ValueError(f"Task {task.value} has no providers configured")
            unknown = [name for name in profile.providers if name not in self.providers]
            if unknown:
                raise ValueError(f"Task {task.value} references unknown providers: {unknown}")
        self.max_retries = max_retries
        self.failure_threshold = failure_threshold
        self.recovery_seconds = recovery_seconds
        self.circuits = {name: CircuitState() for name in self.providers}

    def profile(self, task: LLMTask) -> TaskProfile:
        try:
            return self.task_profiles[task]
        except KeyError as exc:
            raise ValueError(f"No provider profile configured for task {task.value}") from exc

    def provider_chain(self, task: LLMTask) -> list[LLMProvider]:
        return [self.providers[name] for name in self.profile(task).providers]

    def primary_provider(self, task: LLMTask) -> LLMProvider:
        return self.provider_chain(task)[0]

    def max_cost_usd(self, task: LLMTask) -> float:
        return self.profile(task).max_cost_usd

    def _is_available(self, provider: LLMProvider) -> bool:
        state = self.circuits[provider.name]
        if state.opened_at is None:
            return True
        if time.monotonic() - state.opened_at >= self.recovery_seconds:
            state.failures = 0
            state.opened_at = None
            return True
        return False

    def _record_success(self, provider: LLMProvider) -> None:
        self.circuits[provider.name] = CircuitState()

    def _record_failure(self, provider: LLMProvider) -> None:
        state = self.circuits[provider.name]
        state.failures += 1
        if state.failures >= self.failure_threshold:
            state.opened_at = time.monotonic()

    async def generate[OutputModel: BaseModel](
        self,
        *,
        task: LLMTask,
        system_prompt: str,
        user_prompt: str,
        output_model: type[OutputModel],
    ) -> GatewayResult[OutputModel]:
        profile = self.profile(task)
        request = CompletionRequest(
            task=task,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            max_output_tokens=profile.max_output_tokens,
            temperature=profile.temperature,
        )
        errors: list[str] = []
        for provider in self.provider_chain(task):
            if not self._is_available(provider):
                errors.append(f"{provider.name}: circuit open")
                continue
            for attempt in range(self.max_retries + 1):
                try:
                    completion = await provider.complete(request)
                    try:
                        parsed = output_model.model_validate(parse_json_object(completion.content))
                    except (json.JSONDecodeError, ValidationError, ValueError) as exc:
                        raise InvalidStructuredResponseError(
                            f"{provider.name} returned an off-schema response"
                        ) from exc
                    self._record_success(provider)
                    return GatewayResult(
                        result=parsed,
                        provider=provider.name,
                        model=provider.model,
                        input_tokens=completion.input_tokens,
                        output_tokens=completion.output_tokens,
                        estimated_cost_usd=completion.estimated_cost_usd,
                    )
                except Exception as exc:
                    self._record_failure(provider)
                    errors.append(f"{provider.name}: {type(exc).__name__}")
                    status_code = getattr(getattr(exc, "response", None), "status_code", None)
                    # Nem o conteúdo do aluno nem o corpo da resposta entram no log:
                    # apenas o tipo do erro e o código HTTP.
                    logger.warning(
                        "LLM task %s failed on %s attempt %d/%d (%s%s)",
                        task.value,
                        provider.name,
                        attempt + 1,
                        self.max_retries + 1,
                        type(exc).__name__,
                        f", HTTP {status_code}" if status_code else "",
                    )
                    if attempt < self.max_retries and self._is_available(provider):
                        await asyncio.sleep(min(0.25 * (2**attempt), 1))
                    else:
                        break
        raise GatewayUnavailableError("; ".join(errors))

    async def close(self) -> None:
        for provider in self.providers.values():
            await provider.close()
