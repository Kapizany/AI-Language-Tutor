from uuid import UUID

import httpx
import pytest

from app.core.config import Settings
from app.services.auth import (
    AuthTokenRejectedError,
    AuthUserMismatchError,
    AuthUserUnavailableError,
    AuthUserVerifier,
    EmailNotConfirmedError,
)

USER_ID = UUID("10000000-0000-0000-0000-000000000001")


def verifier_for(
    status_code: int,
    payload: dict[str, object],
) -> AuthUserVerifier:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/auth/v1/user"
        assert request.headers["authorization"] == "Bearer access-token"
        assert request.headers["apikey"] == "service-role"
        return httpx.Response(status_code, json=payload)

    return AuthUserVerifier(
        Settings(
            _env_file=None,
            supabase_url="https://project.supabase.co",
            supabase_service_role_key="service-role",
        ),
        transport=httpx.MockTransport(handler),
    )


@pytest.mark.asyncio
async def test_confirmed_account_is_accepted() -> None:
    verifier = verifier_for(
        200,
        {
            "id": str(USER_ID),
            "email": "learner@example.test",
            "email_confirmed_at": "2026-08-01T10:00:00Z",
            "is_anonymous": False,
        },
    )
    try:
        account = await verifier.require_confirmed_user(
            token="access-token",
            expected_user_id=USER_ID,
        )
    finally:
        await verifier.close()

    assert account["email"] == "learner@example.test"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "payload",
    [
        {"id": str(USER_ID), "email_confirmed_at": None, "is_anonymous": False},
        {"id": str(USER_ID), "email_confirmed_at": "2026-08-01T10:00:00Z", "is_anonymous": True},
    ],
)
async def test_unconfirmed_or_anonymous_account_is_rejected(
    payload: dict[str, object],
) -> None:
    verifier = verifier_for(200, payload)
    try:
        with pytest.raises(EmailNotConfirmedError):
            await verifier.require_confirmed_user(
                token="access-token",
                expected_user_id=USER_ID,
            )
    finally:
        await verifier.close()


@pytest.mark.asyncio
async def test_account_mismatch_is_rejected() -> None:
    verifier = verifier_for(
        200,
        {
            "id": "20000000-0000-0000-0000-000000000002",
            "email_confirmed_at": "2026-08-01T10:00:00Z",
        },
    )
    try:
        with pytest.raises(AuthUserMismatchError):
            await verifier.require_confirmed_user(
                token="access-token",
                expected_user_id=USER_ID,
            )
    finally:
        await verifier.close()


@pytest.mark.asyncio
async def test_token_rejected_by_supabase_is_not_reported_as_outage() -> None:
    verifier = verifier_for(401, {"message": "invalid token"})
    try:
        with pytest.raises(AuthTokenRejectedError):
            await verifier.require_confirmed_user(
                token="access-token",
                expected_user_id=USER_ID,
            )
    finally:
        await verifier.close()


@pytest.mark.asyncio
async def test_supabase_failure_is_reported_as_unavailable() -> None:
    verifier = verifier_for(503, {"message": "unavailable"})
    try:
        with pytest.raises(AuthUserUnavailableError):
            await verifier.require_confirmed_user(
                token="access-token",
                expected_user_id=USER_ID,
            )
    finally:
        await verifier.close()
