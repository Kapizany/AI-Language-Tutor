import pytest
from pydantic import ValidationError

from app.services.providers.common import calculate_cost, parse_tutor_reply


def test_structured_response_is_validated() -> None:
    result = parse_tutor_reply('{"reply":"Hello!","correction":null,"should_retry":false}')
    assert result.reply == "Hello!"


def test_invalid_severity_is_rejected() -> None:
    with pytest.raises(ValidationError):
        parse_tutor_reply(
            """
            {
              "reply": "Try again",
              "correction": {
                "original": "x",
                "corrected": "y",
                "explanation_pt_br": "z",
                "severity": "unknown"
              },
              "should_retry": true
            }
            """
        )


def test_cost_calculation_uses_per_million_rates() -> None:
    assert calculate_cost(1_000_000, 500_000, 0.2, 0.8) == 0.6
