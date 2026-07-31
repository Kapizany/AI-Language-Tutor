import logging

from app.core.logging import RedactingFilter, configure_logging, redact


def test_bearer_tokens_are_redacted() -> None:
    assert "Bearer [redacted]" in redact("Authorization: Bearer abc.def-ghi_123=")


def test_supabase_style_jwt_is_redacted() -> None:
    token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMifQ.signature"
    assert token not in redact(f"POST /rest/v1/rpc/x apikey={token}")


def test_query_string_secrets_are_redacted() -> None:
    redacted = redact("GET /v1beta/models/x:generateContent?key=AIzaSyTOPSECRET")
    assert "AIzaSyTOPSECRET" not in redacted
    assert "key=[redacted]" in redacted


def test_learner_email_is_redacted() -> None:
    assert "aluno@example.test" not in redact("user aluno@example.test failed to sign in")


def test_filter_redacts_both_the_template_and_its_arguments() -> None:
    record = logging.LogRecord(
        name="app.tests.redaction",
        level=logging.INFO,
        pathname=__file__,
        lineno=0,
        msg="token Bearer secret-value for %s",
        args=("aluno@example.test",),
        exc_info=None,
    )

    assert RedactingFilter().filter(record) is True
    message = record.getMessage()
    assert "secret-value" not in message
    assert "aluno@example.test" not in message


def test_configure_logging_is_idempotent() -> None:
    configure_logging()
    configure_logging()

    root = logging.getLogger()
    for handler in root.handlers:
        redacting = [item for item in handler.filters if isinstance(item, RedactingFilter)]
        assert len(redacting) <= 1
