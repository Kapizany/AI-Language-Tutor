from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import UUID

import httpx

from app.core.config import Settings
from app.schemas.llm import (
    ConversationMessageView,
    ConversationRole,
    Correction,
    LearnerLevel,
    SessionSummary,
    TargetLanguage,
)
from app.services.providers.common import ConversationPromptContext, HistoryMessage

# Limites do banco (migration 20260731160000). O resumo é truncado para eles em
# vez de recusado: perder o resumo de uma conversa real é pior do que perder o
# final de uma frase.
_HEADLINE_MAX = 200
_ENCOURAGEMENT_MAX = 600
_STRENGTHS_MAX = 5
_FOCUS_AREAS_MAX = 5
_VOCABULARY_MAX = 12

# Uma sessão longa cabe nesta janela; o recorte para o modelo acontece depois, no
# construtor de prompt.
_FULL_HISTORY_LIMIT = 200


class ConversationUnavailableError(RuntimeError):
    """O backend não tem credenciais do Supabase para persistir conversas."""


class ConversationRejectedError(RuntimeError):
    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


@dataclass(frozen=True)
class StartedSession:
    session_id: UUID
    scenario_id: str
    target_language: TargetLanguage
    learner_level: LearnerLevel
    planned_minutes: int
    started_at: datetime
    resumed: bool
    learner_message_count: int
    max_learner_messages: int


@dataclass(frozen=True)
class ConversationContext:
    status: str
    scenario_id: str
    objective_pt_br: str
    goals_pt_br: tuple[str, ...]
    target_language: TargetLanguage
    learner_level: LearnerLevel
    planned_minutes: int
    started_at: datetime
    message_count: int
    learner_message_count: int
    correction_count: int
    max_learner_messages: int
    previously_corrected: tuple[str, ...]
    messages: tuple[ConversationMessageView, ...]

    @property
    def is_active(self) -> bool:
        return self.status == "active"

    @property
    def has_room_for_another_message(self) -> bool:
        return self.learner_message_count < self.max_learner_messages

    def to_prompt_context(self) -> ConversationPromptContext:
        return ConversationPromptContext(
            target_language=self.target_language,
            learner_level=self.learner_level,
            scenario_id=self.scenario_id,
            objective_pt_br=self.objective_pt_br,
            goals_pt_br=self.goals_pt_br,
            history=tuple(
                HistoryMessage(
                    sequence=message.sequence,
                    role=message.role,
                    content=message.content,
                )
                for message in self.messages
            ),
            total_message_count=self.message_count,
            previously_corrected=self.previously_corrected,
            planned_minutes=self.planned_minutes,
        )


@dataclass(frozen=True)
class StoredExchange:
    learner_sequence: int
    tutor_sequence: int
    learner_message_count: int
    max_learner_messages: int


class ConversationService:
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

    async def _rpc(self, name: str, payload: dict[str, Any]) -> Any:
        if not self.enabled:
            raise ConversationUnavailableError("Conversation persistence is not configured")
        response = await self.client.post(f"/rpc/{name}", json=payload)
        response.raise_for_status()
        return response.json()

    async def start(
        self,
        *,
        user_id: UUID,
        scenario_id: str,
        target_language: TargetLanguage,
        learner_level: LearnerLevel,
    ) -> StartedSession:
        result = await self._rpc(
            "start_conversation_session",
            {
                "p_user_id": str(user_id),
                "p_scenario_id": scenario_id,
                "p_target_language": target_language.value,
                "p_learner_level": learner_level.value,
            },
        )
        if not result.get("allowed", False):
            raise ConversationRejectedError(result.get("reason", "conversation_start_rejected"))
        return StartedSession(
            session_id=UUID(result["session_id"]),
            scenario_id=result["scenario_id"],
            target_language=TargetLanguage(result["target_language"]),
            learner_level=LearnerLevel(result["learner_level"]),
            planned_minutes=int(result["planned_minutes"]),
            started_at=datetime.fromisoformat(result["started_at"]),
            resumed=bool(result.get("resumed", False)),
            learner_message_count=int(result.get("learner_message_count", 0)),
            max_learner_messages=int(result["max_learner_messages"]),
        )

    async def context(self, *, session_id: UUID, user_id: UUID) -> ConversationContext:
        result = await self._rpc(
            "get_conversation_context",
            {
                "p_session_id": str(session_id),
                "p_user_id": str(user_id),
                "p_history_limit": _FULL_HISTORY_LIMIT,
            },
        )
        if not result.get("found", False):
            raise ConversationRejectedError("session_not_found")
        return ConversationContext(
            status=result["status"],
            scenario_id=result["scenario_id"],
            objective_pt_br=result["objective_pt_br"],
            goals_pt_br=tuple(result.get("goals_pt_br") or ()),
            target_language=TargetLanguage(result["target_language"]),
            learner_level=LearnerLevel(result["learner_level"]),
            planned_minutes=int(result["planned_minutes"]),
            started_at=datetime.fromisoformat(result["started_at"]),
            message_count=int(result["message_count"]),
            learner_message_count=int(result["learner_message_count"]),
            correction_count=int(result["correction_count"]),
            max_learner_messages=int(result["max_learner_messages"]),
            previously_corrected=tuple(result.get("previously_corrected") or ()),
            messages=tuple(
                ConversationMessageView(
                    sequence=int(item["sequence"]),
                    role=ConversationRole(item["role"]),
                    content=item["content"],
                    correction=(
                        Correction.model_validate(item["correction"])
                        if item.get("correction")
                        else None
                    ),
                )
                for item in result.get("recent_messages") or ()
            ),
        )

    async def append_exchange(
        self,
        *,
        session_id: UUID,
        user_id: UUID,
        learner_message: str,
        tutor_reply: str,
        correction: Correction | None,
        request_id: UUID,
    ) -> StoredExchange:
        result = await self._rpc(
            "append_conversation_exchange",
            {
                "p_session_id": str(session_id),
                "p_user_id": str(user_id),
                "p_learner_message": learner_message,
                "p_tutor_reply": tutor_reply,
                "p_correction": correction.model_dump(mode="json") if correction else None,
                "p_request_id": str(request_id),
            },
        )
        if not result.get("stored", False):
            raise ConversationRejectedError(result.get("reason", "exchange_rejected"))
        return StoredExchange(
            learner_sequence=int(result["learner_sequence"]),
            tutor_sequence=int(result["tutor_sequence"]),
            learner_message_count=int(result["learner_message_count"]),
            max_learner_messages=int(result["max_learner_messages"]),
        )

    async def complete(
        self,
        *,
        session_id: UUID,
        user_id: UUID,
        summary: SessionSummary,
        request_id: UUID | None,
    ) -> SessionSummary:
        stored = clamp_summary(summary)
        result = await self._rpc(
            "complete_conversation_session",
            {
                "p_session_id": str(session_id),
                "p_user_id": str(user_id),
                "p_headline_pt_br": stored.headline_pt_br,
                "p_encouragement_pt_br": stored.encouragement_pt_br,
                "p_strengths_pt_br": stored.strengths_pt_br,
                "p_focus_areas": [item.model_dump(mode="json") for item in stored.focus_areas],
                "p_vocabulary": [item.model_dump(mode="json") for item in stored.vocabulary],
                "p_objective_progress": stored.objective_progress,
                "p_request_id": str(request_id) if request_id else None,
            },
        )
        if not result.get("completed", False):
            raise ConversationRejectedError(result.get("reason", "completion_rejected"))
        return stored

    async def abandon(self, *, session_id: UUID, user_id: UUID) -> None:
        result = await self._rpc(
            "abandon_conversation_session",
            {"p_session_id": str(session_id), "p_user_id": str(user_id)},
        )
        if not result.get("abandoned", False):
            raise ConversationRejectedError(result.get("reason", "abandon_rejected"))

    async def close(self) -> None:
        await self.client.aclose()


def _truncate(value: str, limit: int) -> str:
    trimmed = value.strip()
    if len(trimmed) <= limit:
        return trimmed
    return trimmed[: limit - 1].rstrip() + "…"


def clamp_summary(summary: SessionSummary) -> SessionSummary:
    """Ajusta o resumo aos limites gravados no banco sem descartá-lo."""
    return SessionSummary(
        headline_pt_br=_truncate(summary.headline_pt_br, _HEADLINE_MAX),
        encouragement_pt_br=_truncate(summary.encouragement_pt_br, _ENCOURAGEMENT_MAX),
        strengths_pt_br=[_truncate(item, 300) for item in summary.strengths_pt_br[:_STRENGTHS_MAX]],
        focus_areas=list(summary.focus_areas[:_FOCUS_AREAS_MAX]),
        vocabulary=list(summary.vocabulary[:_VOCABULARY_MAX]),
        objective_progress=summary.objective_progress,
    )
