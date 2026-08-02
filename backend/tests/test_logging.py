import json
import logging

from app.core.logging import (
    CloudJsonFormatter,
    RedactingFilter,
    bind_request_context,
    configure_logging,
    redact,
    reset_request_context,
)


def test_redact_removes_credentials_and_email() -> None:
    message = (
        "Authorization: Bearer secret-token access_token=secret-value payer=test-user@example.com"
    )

    redacted = redact(message)

    assert "secret-token" not in redacted
    assert "secret-value" not in redacted
    assert "test-user@example.com" not in redacted


def test_cloud_json_formatter_adds_safe_context() -> None:
    tokens = bind_request_context("request-123", "trace-456")
    try:
        record = logging.LogRecord(
            name="app.test",
            level=logging.ERROR,
            pathname=__file__,
            lineno=1,
            msg="Checkout failed for test-user@example.com",
            args=(),
            exc_info=None,
        )
        record.operation = "checkout_create"
        record.provider = "mercadopago"
        record.http_status = 400

        payload = json.loads(CloudJsonFormatter().format(record))
    finally:
        reset_request_context(tokens)

    assert payload["severity"] == "ERROR"
    assert payload["message"] == "Checkout failed for [redacted-email]"
    assert payload["request_id"] == "request-123"
    assert payload["trace_id"] == "trace-456"
    assert payload["operation"] == "checkout_create"
    assert payload["provider"] == "mercadopago"
    assert payload["http_status"] == 400


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
