import asyncio
import logging
import time
from collections.abc import Iterable
from dataclasses import dataclass

from app.schemas.llm import TutorReplyRequest
from app.services.providers.base import LLMProvider, ProviderResult

logger = logging.getLogger(__name__)


class GatewayUnavailableError(RuntimeError):
    pass


@dataclass
class CircuitState:
    failures: int = 0
    opened_at: float | None = None


class LLMGateway:
    def __init__(
        self,
        providers: Iterable[LLMProvider],
        *,
        max_retries: int,
        failure_threshold: int,
        recovery_seconds: int,
    ) -> None:
        self.providers = list(providers)
        if not self.providers:
            raise ValueError("At least one LLM provider is required")
        self.max_retries = max_retries
        self.failure_threshold = failure_threshold
        self.recovery_seconds = recovery_seconds
        self.circuits = {provider.name: CircuitState() for provider in self.providers}

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

    async def generate_tutor_reply(self, request: TutorReplyRequest) -> ProviderResult:
        errors: list[str] = []
        for provider in self.providers:
            if not self._is_available(provider):
                errors.append(f"{provider.name}: circuit open")
                continue
            for attempt in range(self.max_retries + 1):
                try:
                    result = await provider.generate_tutor_reply(request)
                    self._record_success(provider)
                    return result
                except Exception as exc:
                    self._record_failure(provider)
                    errors.append(f"{provider.name}: {type(exc).__name__}")
                    status_code = getattr(getattr(exc, "response", None), "status_code", None)
                    logger.warning(
                        "LLM provider %s failed on attempt %d/%d (%s%s)",
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
        for provider in self.providers:
            close = getattr(provider, "close", None)
            if close is not None:
                await close()
