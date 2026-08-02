import time
from typing import Annotated, NoReturn
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response, status

from app.api.dependencies import BudgetDependency, SynthesisDependency, TranscriptionDependency
from app.core.security import get_current_user
from app.schemas.auth import AuthenticatedUser
from app.schemas.llm import (
    SpeechSynthesisRequest,
    SpeechTranscriptionResponse,
    TargetLanguage,
    UsageSummary,
)
from app.services.budget import (
    AccountSuspendedError,
    BudgetExceededError,
    PremiumRequiredError,
    VoiceConsentRequiredError,
)
from app.services.speech_providers.google_standard import SynthesisUnavailableError
from app.services.synthesis import InvalidSynthesisTextError
from app.services.transcription import InvalidAudioError, TranscriptionUnavailableError

router = APIRouter(prefix="/api/v1/speech", tags=["speech"])

ALLOWED_AUDIO_TYPES = {
    "audio/mp4",
    "audio/mpeg",
    "audio/ogg",
    "audio/wav",
    "audio/webm",
}


def _raise_synthesis_auth_error(exc: Exception) -> NoReturn:
    if isinstance(exc, PremiumRequiredError):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Ouvir pronúncia está disponível no plano Premium.",
        ) from exc
    if isinstance(exc, BudgetExceededError):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    if isinstance(exc, AccountSuspendedError):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sua conta está suspensa. Entre em contato com o suporte.",
        ) from exc
    raise exc


@router.post("/synthesize")
async def synthesize_speech(
    payload: SpeechSynthesisRequest,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    synthesis: SynthesisDependency,
    budget: BudgetDependency,
) -> Response:
    try:
        normalized_text = synthesis.normalize_text(payload.text)
    except InvalidSynthesisTextError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Texto inválido para síntese.",
        ) from exc

    character_count = len(normalized_text)
    speaking_rate = synthesis.normalize_speaking_rate(payload.speaking_rate)
    started_at = time.monotonic()

    try:
        cached_result = await synthesis.get_cached(
            text=normalized_text,
            language=payload.language.value,
            speaking_rate=speaking_rate,
        )
    except InvalidSynthesisTextError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Texto inválido para síntese.",
        ) from exc

    if cached_result is not None:
        try:
            await budget.authorize_synthesis(
                user_id=user.id,
                character_count=character_count,
                meter_usage=False,
            )
        except (PremiumRequiredError, BudgetExceededError, AccountSuspendedError) as exc:
            _raise_synthesis_auth_error(exc)
        return Response(
            content=cached_result.audio,
            media_type=cached_result.content_type,
            headers={
                "X-Speech-Cached": "1",
                "X-Request-ID": str(payload.request_id),
                "Cache-Control": "private, max-age=86400",
            },
        )

    try:
        await budget.authorize_synthesis(
            user_id=user.id,
            character_count=character_count,
            meter_usage=True,
        )
    except (PremiumRequiredError, BudgetExceededError, AccountSuspendedError) as exc:
        _raise_synthesis_auth_error(exc)

    try:
        await budget.reserve(
            user_id=user.id,
            request_id=payload.request_id,
            feature="speech_synthesis",
            provider=synthesis.provider_name,
            model=synthesis.model,
            estimated_max_cost_usd=synthesis.max_cost_usd,
        )
    except BudgetExceededError as exc:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(exc)) from exc
    except AccountSuspendedError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sua conta está suspensa. Entre em contato com o suporte.",
        ) from exc

    try:
        result, cached = await synthesis.synthesize(
            text=normalized_text,
            language=payload.language.value,
            speaking_rate=speaking_rate,
            use_cache=True,
        )
    except InvalidSynthesisTextError as exc:
        latency_ms = round((time.monotonic() - started_at) * 1_000)
        await budget.finalize(
            request_id=payload.request_id,
            status="failed",
            provider=synthesis.provider_name,
            model=synthesis.model,
            latency_ms=latency_ms,
            error_code="invalid_text",
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Texto inválido para síntese.",
        ) from exc
    except SynthesisUnavailableError as exc:
        latency_ms = round((time.monotonic() - started_at) * 1_000)
        await budget.finalize(
            request_id=payload.request_id,
            status="failed",
            provider=synthesis.provider_name,
            model=synthesis.model,
            latency_ms=latency_ms,
            error_code="synthesis_unavailable",
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="A síntese de voz está temporariamente indisponível.",
        ) from exc

    latency_ms = round((time.monotonic() - started_at) * 1_000)
    await budget.finalize(
        request_id=payload.request_id,
        status="succeeded",
        provider=result.provider,
        model="cache" if cached else synthesis.model,
        input_tokens=0 if cached else result.character_count,
        output_tokens=0,
        estimated_cost_usd=0.0 if cached else result.estimated_cost_usd,
        latency_ms=latency_ms,
    )
    return Response(
        content=result.audio,
        media_type=result.content_type,
        headers={
            "X-Speech-Cached": "1" if cached else "0",
            "X-Request-ID": str(payload.request_id),
            "Cache-Control": "private, max-age=86400",
        },
    )


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
