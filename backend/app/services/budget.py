from dataclasses import dataclass
from uuid import UUID

import httpx

from app.core.config import Settings


class BudgetExceededError(RuntimeError):
    pass


class AccountSuspendedError(RuntimeError):
    pass


class VoiceConsentRequiredError(RuntimeError):
    pass


class PremiumRequiredError(RuntimeError):
    pass


@dataclass(frozen=True)
class BudgetReservation:
    allowed: bool
    reason: str | None = None


class BudgetService:
    voice_policy_version = "2026-07-31-voice-v1"

    def __init__(self, settings: Settings) -> None:
        self.enabled = bool(settings.supabase_url and settings.supabase_service_role_key)
        self.max_request_cost_usd = settings.llm_max_cost_per_request_usd
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

    async def reserve(
        self,
        *,
        user_id: UUID,
        request_id: UUID,
        feature: str,
        provider: str,
        model: str,
        estimated_max_cost_usd: float,
    ) -> None:
        if not self.enabled:
            return
        response = await self.client.post(
            "/rpc/reserve_llm_budget",
            json={
                "p_user_id": str(user_id),
                "p_request_id": str(request_id),
                "p_feature": feature,
                "p_provider": provider,
                "p_model": model,
                "p_estimated_max_cost_usd": estimated_max_cost_usd,
            },
        )
        if response.status_code == 409:
            raise BudgetExceededError("Duplicate request identifier")
        response.raise_for_status()
        result = response.json()
        if not result.get("allowed", False):
            reason = result.get("reason", "Budget limit reached")
            if reason == "account_suspended":
                raise AccountSuspendedError(reason)
            raise BudgetExceededError(reason)

    async def authorize_synthesis(
        self,
        *,
        user_id: UUID,
        character_count: int,
        meter_usage: bool = True,
    ) -> None:
        if not self.enabled:
            return
        response = await self.client.post(
            "/rpc/check_speech_synthesis_access",
            json={
                "p_user_id": str(user_id),
                "p_character_count": character_count,
                "p_meter_usage": meter_usage,
            },
        )
        response.raise_for_status()
        result = response.json()
        if result.get("allowed", False):
            return
        reason = result.get("reason")
        if reason == "premium_required":
            raise PremiumRequiredError("Premium plan required for text-to-speech")
        if reason == "account_suspended":
            raise AccountSuspendedError(reason)
        if reason == "invalid_text_length":
            raise BudgetExceededError("Text length is outside the allowed range")
        raise BudgetExceededError("Too many speech synthesis attempts. Try again shortly.")

    async def authorize_transcription(self, *, user_id: UUID) -> None:
        if not self.enabled:
            return
        response = await self.client.post(
            "/rpc/check_speech_transcription_access",
            json={
                "p_user_id": str(user_id),
                "p_policy_version": self.voice_policy_version,
            },
        )
        response.raise_for_status()
        result = response.json()
        if result.get("allowed", False):
            return
        reason = result.get("reason")
        if reason == "voice_consent_required":
            raise VoiceConsentRequiredError("Voice processing consent is required")
        if reason == "account_suspended":
            raise AccountSuspendedError(reason)
        raise BudgetExceededError("Too many transcription attempts. Try again shortly.")

    async def finalize(
        self,
        *,
        request_id: UUID,
        status: str,
        provider: str,
        model: str,
        input_tokens: int = 0,
        output_tokens: int = 0,
        estimated_cost_usd: float = 0,
        latency_ms: int = 0,
        error_code: str | None = None,
    ) -> None:
        if not self.enabled:
            return
        response = await self.client.post(
            "/rpc/finalize_llm_usage",
            json={
                "p_request_id": str(request_id),
                "p_status": status,
                "p_provider": provider,
                "p_model": model,
                "p_input_tokens": input_tokens,
                "p_output_tokens": output_tokens,
                "p_estimated_cost_usd": estimated_cost_usd,
                "p_latency_ms": latency_ms,
                "p_error_code": error_code,
            },
        )
        response.raise_for_status()

    async def close(self) -> None:
        await self.client.aclose()
