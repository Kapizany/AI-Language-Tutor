from uuid import UUID, uuid4

import httpx
import pytest

from app.core.config import Settings
from app.core.security import get_current_user
from app.main import app
from app.schemas.auth import AuthenticatedUser
from app.services.budget import BudgetService
from app.services.gateway import LLMGateway
from app.services.providers.mock import MockProvider


async def authenticated_user() -> AuthenticatedUser:
    return AuthenticatedUser(
        id=UUID("10000000-0000-0000-0000-000000000001"),
        email="learner@example.test",
    )


def build_test_gateway() -> LLMGateway:
    return LLMGateway(
        [MockProvider()],
        max_retries=0,
        failure_threshold=3,
        recovery_seconds=30,
    )


@pytest.mark.asyncio
async def test_health() -> None:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_private_route_requires_authentication() -> None:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get("/api/v1/me")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_mock_tutor_reply() -> None:
    budget = BudgetService(Settings(_env_file=None))
    app.state.gateway = build_test_gateway()
    app.state.budget_service = budget
    app.dependency_overrides[get_current_user] = authenticated_user
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            response = await client.post(
                "/api/v1/ai/tutor/reply",
                json={
                    "message": "Hello",
                    "target_language": "en",
                    "learner_level": "A1",
                    "scenario": "coffee",
                    "request_id": str(uuid4()),
                },
            )
    finally:
        app.dependency_overrides.clear()
        await budget.close()

    assert response.status_code == 200
    assert response.json()["usage"]["provider"] == "mock"
    assert response.json()["usage"]["estimated_cost_usd"] == 0
