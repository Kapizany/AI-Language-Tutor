"""Fixtures compartilhadas pelos testes do gateway e das rotas de conversa."""

from datetime import UTC, datetime
from uuid import UUID

from app.schemas.llm import (
    ConversationMessageView,
    ConversationRole,
    LearnerLevel,
    TargetLanguage,
)
from app.services.conversation import ConversationContext
from app.services.providers.common import (
    ConversationPromptContext,
    HistoryMessage,
    build_tutor_prompt,
)

LEARNER_ID = UUID("10000000-0000-0000-0000-000000000001")
SESSION_ID = UUID("40000000-0000-0000-0000-000000000001")


def prompt_context(
    *,
    target_language: TargetLanguage = TargetLanguage.ENGLISH,
    learner_level: LearnerLevel = LearnerLevel.A2,
) -> ConversationPromptContext:
    return ConversationPromptContext(
        target_language=target_language,
        learner_level=learner_level,
        scenario_id="coffee",
        objective_pt_br="Faça um pedido completo e pergunte o preço.",
        goals_pt_br=("Cumprimentar", "Fazer o pedido"),
        history=(
            HistoryMessage(
                sequence=1,
                role=ConversationRole.TUTOR,
                content="Good afternoon! What can I get for you?",
            ),
        ),
        total_message_count=1,
    )


def tutor_prompt(learner_message: str) -> str:
    return build_tutor_prompt(prompt_context(), learner_message)


def conversation_context(
    *,
    status: str = "active",
    learner_message_count: int = 0,
    max_learner_messages: int = 30,
    messages: tuple[ConversationMessageView, ...] | None = None,
) -> ConversationContext:
    return ConversationContext(
        status=status,
        scenario_id="coffee",
        objective_pt_br="Faça um pedido completo e pergunte o preço.",
        goals_pt_br=("Cumprimentar", "Fazer o pedido"),
        target_language=TargetLanguage.ENGLISH,
        learner_level=LearnerLevel.A2,
        planned_minutes=10,
        started_at=datetime(2026, 7, 31, 12, 0, tzinfo=UTC),
        message_count=1 + learner_message_count * 2,
        learner_message_count=learner_message_count,
        correction_count=0,
        max_learner_messages=max_learner_messages,
        previously_corrected=(),
        messages=messages
        if messages is not None
        else (
            ConversationMessageView(
                sequence=1,
                role=ConversationRole.TUTOR,
                content="Good afternoon! What can I get for you?",
            ),
        ),
    )
