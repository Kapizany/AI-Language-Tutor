from typing import Any
from uuid import UUID

import httpx

from app.core.config import Settings


class AuthUserUnavailableError(RuntimeError):
    """The hosted authentication service could not validate the user."""


class EmailNotConfirmedError(RuntimeError):
    """The access token belongs to an account without confirmed email."""


class AuthUserMismatchError(RuntimeError):
    """The remotely validated user does not match the signed JWT subject."""


class AuthTokenRejectedError(RuntimeError):
    """Supabase Auth rejected a locally well-formed token."""


class AuthUserVerifier:
    """Validate account state with Supabase Auth after local JWT verification.

    A valid signature proves who issued the token, but it does not by itself
    prove that the account still exists or that its email is confirmed. The
    `/auth/v1/user` lookup supplies those mutable account-state checks.
    """

    def __init__(self, settings: Settings, *, transport: httpx.AsyncBaseTransport | None = None):
        self.enabled = bool(settings.supabase_url and settings.supabase_service_role_key)
        self.client = httpx.AsyncClient(
            base_url=(
                f"{settings.supabase_url.rstrip('/')}/auth/v1"
                if settings.supabase_url
                else "http://localhost"
            ),
            timeout=10,
            transport=transport,
            headers={
                "apikey": settings.supabase_service_role_key,
            },
        )

    async def require_confirmed_user(
        self,
        *,
        token: str,
        expected_user_id: UUID,
    ) -> dict[str, Any]:
        if not self.enabled:
            raise AuthUserUnavailableError("Supabase account validation is not configured")

        try:
            response = await self.client.get(
                "/user",
                headers={"Authorization": f"Bearer {token}"},
            )
        except httpx.HTTPError as exc:
            raise AuthUserUnavailableError("Supabase Auth is unavailable") from exc

        if response.status_code in {401, 403}:
            raise AuthTokenRejectedError("The access token is no longer accepted")
        if response.is_error:
            raise AuthUserUnavailableError("Supabase Auth could not validate the account")

        payload: dict[str, Any] = response.json()
        if str(payload.get("id", "")) != str(expected_user_id):
            raise AuthUserMismatchError("The validated account does not match the JWT subject")
        if payload.get("is_anonymous") is True or not payload.get("email_confirmed_at"):
            raise EmailNotConfirmedError("Email confirmation is required")
        return payload

    async def close(self) -> None:
        await self.client.aclose()
