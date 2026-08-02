import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_recommended_provider_and_prices_are_safe_defaults() -> None:
    settings = Settings(_env_file=None)

    assert settings.llm_primary_provider == "gemini"
    assert settings.llm_fallback_providers == ["deepseek"]
    assert settings.gemini_model == "gemini-3.1-flash-lite"
    assert settings.gemini_input_usd_per_million == 0.25
    assert settings.gemini_output_usd_per_million == 1.50
    assert settings.deepseek_model == "deepseek-v4-flash"
    assert settings.deepseek_input_usd_per_million == 0.14
    assert settings.deepseek_output_usd_per_million == 0.28
    assert settings.llm_max_output_tokens == 1_024


def test_csv_settings_are_parsed() -> None:
    settings = Settings(
        _env_file=None,
        app_allowed_origins="http://localhost:3000,https://ai-language-tutor.caps-labs.com",
        llm_fallback_providers="gemini,deepseek",
    )

    assert settings.app_allowed_origins == [
        "http://localhost:3000",
        "https://ai-language-tutor.caps-labs.com",
    ]
    assert settings.llm_fallback_providers == ["gemini", "deepseek"]


def test_disabled_billing_does_not_block_production_startup() -> None:
    settings = Settings(
        _env_file=None,
        app_env="production",
        supabase_url="https://example.supabase.co",
        supabase_service_role_key="service-role",
        gemini_api_key="gemini",
        deepseek_api_key="deepseek",
        mercadopago_billing_enabled=False,
    )
    assert not settings.mercadopago_billing_enabled


def test_enabled_billing_requires_both_mercadopago_secrets() -> None:
    with pytest.raises(ValidationError, match="MERCADOPAGO_WEBHOOK_SECRET"):
        Settings(
            _env_file=None,
            app_env="production",
            supabase_url="https://example.supabase.co",
            supabase_service_role_key="service-role",
            gemini_api_key="gemini",
            deepseek_api_key="deepseek",
            mercadopago_billing_enabled=True,
            mercadopago_access_token="access-token",
        )
