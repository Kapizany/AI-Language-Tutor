from uuid import uuid4

import pytest

from app.schemas.llm import LearnerLevel, TargetLanguage, TutorReplyRequest
from app.services.gateway import LLMGateway
from app.services.providers.base import LLMProvider, ProviderResult
from app.services.providers.mock import MockProvider


class FailingProvider(LLMProvider):
    name = "failing"
    model = "always-fails"

    async def generate_tutor_reply(self, request: TutorReplyRequest) -> ProviderResult:
        raise TimeoutError


def request() -> TutorReplyRequest:
    return TutorReplyRequest(
        message="Hello",
        target_language=TargetLanguage.ENGLISH,
        learner_level=LearnerLevel.A1,
        scenario="coffee",
        request_id=uuid4(),
    )


@pytest.mark.asyncio
async def test_gateway_uses_mock_without_cost() -> None:
    gateway = LLMGateway(
        [MockProvider()],
        max_retries=0,
        failure_threshold=3,
        recovery_seconds=30,
    )

    result = await gateway.generate_tutor_reply(request())

    assert result.provider == "mock"
    assert result.estimated_cost_usd == 0
    assert result.result.reply


@pytest.mark.asyncio
async def test_gateway_falls_back_after_provider_failure() -> None:
    gateway = LLMGateway(
        [FailingProvider(), MockProvider()],
        max_retries=0,
        failure_threshold=1,
        recovery_seconds=30,
    )

    result = await gateway.generate_tutor_reply(request())

    assert result.provider == "mock"
    assert gateway.circuits["failing"].opened_at is not None
