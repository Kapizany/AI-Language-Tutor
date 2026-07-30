from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, Field


class TargetLanguage(StrEnum):
    ENGLISH = "en"
    SPANISH = "es"
    FRENCH = "fr"
    ITALIAN = "it"


class LearnerLevel(StrEnum):
    UNKNOWN = "unknown"
    A1 = "A1"
    A2 = "A2"
    B1 = "B1"
    B2 = "B2"


class TutorReplyRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2_000)
    target_language: TargetLanguage
    learner_level: LearnerLevel
    scenario: str = Field(min_length=1, max_length=100)
    request_id: UUID


class Correction(BaseModel):
    original: str
    corrected: str
    explanation_pt_br: str
    severity: str = Field(pattern="^(minor|important|blocking)$")


class TutorReply(BaseModel):
    reply: str
    correction: Correction | None = None
    should_retry: bool = False


class UsageSummary(BaseModel):
    provider: str
    model: str
    input_tokens: int = Field(ge=0)
    output_tokens: int = Field(ge=0)
    estimated_cost_usd: float = Field(ge=0)
    latency_ms: int = Field(ge=0)


class TutorReplyResponse(BaseModel):
    request_id: UUID
    result: TutorReply
    usage: UsageSummary
