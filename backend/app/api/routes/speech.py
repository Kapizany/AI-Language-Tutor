import time
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status

from app.api.dependencies import BudgetDependency, TranscriptionDependency
from app.core.security import get_current_user
from app.schemas.auth import AuthenticatedUser
from app.schemas.llm import SpeechTranscriptionResponse, TargetLanguage, UsageSummary
from app.services.budget import (
    AccountSuspendedError,
    BudgetExceededError,
    VoiceConsentRequiredError,
)
from app.services.transcription import InvalidAudioError, TranscriptionUnavailableError

router = APIRouter(prefix="/api/v1/speech", tags=["speech"])

ALLOWED_AUDIO_TYPES = {
    "audio/mp4",
    "audio/mpeg",
    "audio/ogg",
    "audio/wav",
    "audio/webm",
}


@router.post("/transcribe", response_model=SpeechTranscriptionResponse)
async def transcribe_audio(
    request: Request,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    transcription: TranscriptionDependency,
    budget: BudgetDependency,
    language: Annotated[TargetLanguage, Query()],
    request_id: Annotated[UUID, Query()],
    content_type: Annotated[str | None, Header()] = None,
) -> SpeechTranscriptionResponse:
    mime_type = (content_type or "").split(";", 1)[0].strip().lower()
    if mime_type not in ALLOWED_AUDIO_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Unsupported audio format.",
        )

    content_length = request.headers.get("content-length")
    if content_length:
        try:
            declared_length = int(content_length)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid content length.",
            ) from exc
        if declared_length > transcription.max_audio_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail="Audio is too large.",
            )

    try:
        await budget.authorize_transcription(user_id=user.id)
    except VoiceConsentRequiredError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Aceite o processamento de voz antes de usar o microfone.",
        ) from exc
    except BudgetExceededError as exc:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(exc)) from exc
    except AccountSuspendedError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sua conta está suspensa. Entre em contato com o suporte.",
        ) from exc

    audio = bytearray()
    async for chunk in request.stream():
        audio.extend(chunk)
        if len(audio) > transcription.max_audio_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail="Audio is too large.",
            )
    if len(audio) < 100:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Audio is empty.",
        )
    try:
        mime_type = transcription.validate_audio(bytes(audio), mime_type)
    except InvalidAudioError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="O conteúdo do áudio não corresponde ao formato informado.",
        ) from exc

    try:
        await budget.reserve(
            user_id=user.id,
            request_id=request_id,
            feature="speech_transcription",
            provider=transcription.provider,
            model=transcription.model,
            estimated_max_cost_usd=transcription.max_cost_usd,
        )
    except BudgetExceededError as exc:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(exc)) from exc
    except AccountSuspendedError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sua conta está suspensa. Entre em contato com o suporte.",
        ) from exc

    started_at = time.monotonic()
    try:
        result = await transcription.transcribe(
            audio=bytes(audio),
            mime_type=mime_type,
            language=language.value,
        )
    except TranscriptionUnavailableError as exc:
        latency_ms = round((time.monotonic() - started_at) * 1_000)
        await budget.finalize(
            request_id=request_id,
            status="failed",
            provider=transcription.provider,
            model=transcription.model,
            latency_ms=latency_ms,
            error_code="transcription_unavailable",
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Audio transcription is temporarily unavailable.",
        ) from exc

    latency_ms = round((time.monotonic() - started_at) * 1_000)
    await budget.finalize(
        request_id=request_id,
        status="succeeded",
        provider=result.provider,
        model=result.model,
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
        estimated_cost_usd=result.estimated_cost_usd,
        latency_ms=latency_ms,
    )
    return SpeechTranscriptionResponse(
        request_id=request_id,
        transcript=result.transcript,
        usage=UsageSummary(
            provider=result.provider,
            model=result.model,
            input_tokens=result.input_tokens,
            output_tokens=result.output_tokens,
            estimated_cost_usd=result.estimated_cost_usd,
            latency_ms=latency_ms,
        ),
    )
