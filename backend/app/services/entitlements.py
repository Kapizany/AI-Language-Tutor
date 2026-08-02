from uuid import UUID

import httpx

from app.core.config import Settings


class EntitlementService:
    def __init__(self, settings: Settings) -> None:
        self.enabled = bool(settings.supabase_url and settings.supabase_service_role_key)
        self.client = httpx.AsyncClient(
            base_url=(
                f"{settings.supabase_url.rstrip('/')}/rest/v1"
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

    async def get_summary(self, user_id: UUID) -> dict[str, object]:
        if not self.enabled:
            return {"found": False}
        response = await self.client.post(
            "/rpc/get_user_entitlements_summary",
            json={"p_user_id": str(user_id)},
        )
        response.raise_for_status()
        payload = response.json()
        return payload if isinstance(payload, dict) else {}

    async def is_admin(self, user_id: UUID) -> bool:
        if not self.enabled:
            return False
        response = await self.client.post(
            "/rpc/user_is_admin",
            json={"p_user_id": str(user_id)},
        )
        response.raise_for_status()
        return bool(response.json())

    async def close(self) -> None:
        await self.client.aclose()
