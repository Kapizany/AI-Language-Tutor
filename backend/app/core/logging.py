import logging
import re

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


def configure_logging() -> None:
    root = logging.getLogger()
    if not root.handlers:
        logging.basicConfig(level=logging.INFO)

    redacting = RedactingFilter()
    handlers = list(root.handlers)
    for name in ("uvicorn", "uvicorn.access", "uvicorn.error", "httpx"):
        handlers.extend(logging.getLogger(name).handlers)
    for handler in handlers:
        if not any(isinstance(existing, RedactingFilter) for existing in handler.filters):
            handler.addFilter(redacting)
