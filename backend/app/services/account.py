from uuid import UUID

import httpx

from app.core.config import Settings


class AccountDeletionUnavailableError(RuntimeError):
    pass


class AccountDeletionError(RuntimeError):
    pass


class AccountService:
    def __init__(self, settings: Settings) -> None:
        self.enabled = bool(settings.supabase_url and settings.supabase_service_role_key)
        self.client = httpx.AsyncClient(
            base_url=(
                f"{settings.supabase_url.rstrip('/')}/auth/v1/admin"
                if settings.supabase_url
                else "http://localhost"
            ),
            timeout=10,
            headers={
                "apikey": settings.supabase_service_role_key,
                "Authorization": f"Bearer {settings.supabase_service_role_key}",
                "Content-Type": "application/json",
            },
        )

    async def delete_user(self, user_id: UUID) -> None:
        if not self.enabled:
            raise AccountDeletionUnavailableError("Account deletion is not configured")

        response = await self.client.delete(f"/users/{user_id}")
        if response.status_code == 404:
            return
        if response.is_error:
            raise AccountDeletionError(
                f"Supabase rejected account deletion with status {response.status_code}"
            )

    async def close(self) -> None:
        await self.client.aclose()
