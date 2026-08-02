import json
import logging
import os
import re
from contextvars import ContextVar, Token
from datetime import UTC, datetime
from typing import Any

_request_id: ContextVar[str] = ContextVar("request_id", default="")
_trace_id: ContextVar[str] = ContextVar("trace_id", default="")

_SAFE_EXTRA_FIELDS = (
    "operation",
    "provider",
    "http_status",
    "rpc",
    "billing_cycle",
    "reason",
    "http_method",
    "http_path",
    "error_type",
    "billing_enabled",
    "mock_checkout",
    "test_checkout",
)

# Nenhum log da aplicação deve carregar dado pessoal. O gateway já registra apenas
# tipo de erro e código HTTP, mas bibliotecas de terceiros (httpx, uvicorn) podem
# incluir URLs com token ou email, então a redação acontece na saída.
_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"(?i)\b(bearer)\s+[A-Za-z0-9._~+/-]+=*"), r"\1 [redacted]"),
    (re.compile(r"\beyJ[A-Za-z0-9._-]{10,}"), "[redacted-jwt]"),
    (
        re.compile(r"(?i)\b(apikey|api_key|access_token|refresh_token|key)=[^&\s\"']+"),
        r"\1=[redacted]",
    ),
    (re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"), "[redacted-email]"),
)


def redact(message: str) -> str:
    for pattern, replacement in _PATTERNS:
        message = pattern.sub(replacement, message)
    return message


def bind_request_context(request_id: str, trace_id: str) -> tuple[Token[str], Token[str]]:
    return _request_id.set(request_id), _trace_id.set(trace_id)


def reset_request_context(tokens: tuple[Token[str], Token[str]]) -> None:
    request_token, trace_token = tokens
    _request_id.reset(request_token)
    _trace_id.reset(trace_token)


class RedactingFilter(logging.Filter):
    """Aplicado aos handlers, alcança os registros de todos os loggers."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = redact(record.msg)
        if record.args:
            if isinstance(record.args, dict):
                record.args = {
                    key: redact(value) if isinstance(value, str) else value
                    for key, value in record.args.items()
                }
            elif isinstance(record.args, tuple):
                record.args = tuple(
                    redact(value) if isinstance(value, str) else value for value in record.args
                )
        return True


class CloudJsonFormatter(logging.Formatter):
    """Emit structured records that Cloud Logging can filter and correlate."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "severity": record.levelname,
            "message": redact(record.getMessage()),
            "logger": record.name,
            "timestamp": datetime.fromtimestamp(record.created, tz=UTC).isoformat(),
        }
        request_id = _request_id.get()
        trace_id = _trace_id.get()
        if request_id:
            payload["request_id"] = request_id
        if trace_id:
            payload["trace_id"] = trace_id
            project_id = os.getenv("GOOGLE_CLOUD_PROJECT") or os.getenv("GCP_PROJECT_ID")
            if project_id:
                payload["logging.googleapis.com/trace"] = f"projects/{project_id}/traces/{trace_id}"
        for field in _SAFE_EXTRA_FIELDS:
            value = getattr(record, field, None)
            if value is not None:
                payload[field] = value
        if record.exc_info:
            payload["exception"] = redact(self.formatException(record.exc_info))
        return json.dumps(payload, ensure_ascii=False, default=str)


def configure_logging() -> None:
    root = logging.getLogger()
    if not root.handlers:
        logging.basicConfig(level=logging.INFO)

    redacting = RedactingFilter()
    handlers = list(root.handlers)
    for name in ("uvicorn", "uvicorn.access", "uvicorn.error", "httpx"):
        handlers.extend(logging.getLogger(name).handlers)
    unique_handlers = {id(handler): handler for handler in handlers}.values()
    for handler in unique_handlers:
        if not any(isinstance(existing, RedactingFilter) for existing in handler.filters):
            handler.addFilter(redacting)
        if os.getenv("K_SERVICE"):
            handler.setFormatter(CloudJsonFormatter())
