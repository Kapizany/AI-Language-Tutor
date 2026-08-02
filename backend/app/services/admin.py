from datetime import datetime
from typing import Any
from uuid import UUID

import httpx

from app.core.config import Settings


class AdminServiceError(RuntimeError):
    pass


class AdminService:
    def __init__(self, settings: Settings) -> None:
        self.enabled = bool(settings.supabase_url and settings.supabase_service_role_key)
        self.client = httpx.AsyncClient(
            base_url=(
                f"{settings.supabase_url.rstrip('/')}/rest/v1"
                if settings.supabase_url
                else "http://localhost"
            ),
            timeout=15,
            headers={
                "apikey": settings.supabase_service_role_key,
                "Authorization": f"Bearer {settings.supabase_service_role_key}",
                "Content-Type": "application/json",
            },
        )

    async def _rpc(self, name: str, payload: dict[str, Any]) -> Any:
        if not self.enabled:
            raise AdminServiceError("Admin operations are not configured")
        response = await self.client.post(f"/rpc/{name}", json=payload)
        if response.status_code >= 400:
            detail = response.text
            if "Admin role required" in detail:
                raise AdminServiceError("Admin role required")
            raise AdminServiceError(f"Admin RPC {name} failed: {detail}")
        return response.json()

    async def get_overview(
        self,
        *,
        actor_user_id: UUID,
        from_at: datetime | None = None,
        to_at: datetime | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"p_actor_user_id": str(actor_user_id)}
        if from_at is not None:
            payload["p_from"] = from_at.isoformat()
        if to_at is not None:
            payload["p_to"] = to_at.isoformat()
        result = await self._rpc("admin_get_overview", payload)
        return result if isinstance(result, dict) else {}

    async def search_users(
        self,
        *,
        actor_user_id: UUID,
        query: str = "",
        limit: int = 20,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        result = await self._rpc(
            "admin_search_users",
            {
                "p_actor_user_id": str(actor_user_id),
                "p_query": query,
                "p_limit": limit,
                "p_offset": offset,
            },
        )
        return result if isinstance(result, list) else []

    async def get_user_summary(
        self,
        *,
        actor_user_id: UUID,
        target_user_id: UUID,
    ) -> dict[str, Any]:
        result = await self._rpc(
            "admin_get_user_summary",
            {
                "p_actor_user_id": str(actor_user_id),
                "p_target_user_id": str(target_user_id),
            },
        )
        return result if isinstance(result, dict) else {"found": False}

    async def change_user_plan(
        self,
        *,
        actor_user_id: UUID,
        target_user_id: UUID,
        plan_id: str,
    ) -> dict[str, Any]:
        result = await self._rpc(
            "admin_change_user_plan",
            {
                "p_actor_user_id": str(actor_user_id),
                "p_target_user_id": str(target_user_id),
                "p_plan_id": plan_id,
            },
        )
        return result if isinstance(result, dict) else {"updated": False}

    async def set_user_admin_role(
        self,
        *,
        actor_user_id: UUID,
        target_user_id: UUID,
        is_admin: bool,
    ) -> dict[str, Any]:
        result = await self._rpc(
            "admin_set_user_admin_role",
            {
                "p_actor_user_id": str(actor_user_id),
                "p_target_user_id": str(target_user_id),
                "p_is_admin": is_admin,
            },
        )
        return result if isinstance(result, dict) else {"updated": False}

    async def set_account_status(
        self,
        *,
        actor_user_id: UUID,
        target_user_id: UUID,
        status: str,
        reason: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "p_actor_user_id": str(actor_user_id),
            "p_target_user_id": str(target_user_id),
            "p_status": status,
        }
        if reason is not None:
            payload["p_reason"] = reason
        result = await self._rpc("admin_set_account_status", payload)
        return result if isinstance(result, dict) else {"updated": False}

    async def list_audit_logs(
        self,
        *,
        actor_user_id: UUID,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        result = await self._rpc(
            "admin_list_audit_logs",
            {
                "p_actor_user_id": str(actor_user_id),
                "p_limit": limit,
                "p_offset": offset,
            },
        )
        return result if isinstance(result, list) else []

    async def get_feature_usage(
        self,
        *,
        actor_user_id: UUID,
        from_at: datetime | None = None,
        to_at: datetime | None = None,
    ) -> list[dict[str, Any]]:
        payload: dict[str, Any] = {"p_actor_user_id": str(actor_user_id)}
        if from_at is not None:
            payload["p_from"] = from_at.isoformat()
        if to_at is not None:
            payload["p_to"] = to_at.isoformat()
        result = await self._rpc("admin_get_feature_usage", payload)
        return result if isinstance(result, list) else []

    async def close(self) -> None:
        await self.client.aclose()
