from app.core.config import Settings


def test_recommended_provider_and_prices_are_safe_defaults() -> None:
    settings = Settings()

    assert settings.llm_primary_provider == "gemini"
    assert settings.llm_fallback_providers == ["deepseek"]
    assert settings.gemini_model == "gemini-2.5-flash-lite"
    assert settings.gemini_input_usd_per_million == 0.10
    assert settings.gemini_output_usd_per_million == 0.40
    assert settings.deepseek_model == "deepseek-v4-flash"
    assert settings.deepseek_input_usd_per_million == 0.14
    assert settings.deepseek_output_usd_per_million == 0.28
    assert settings.llm_max_output_tokens == 1_024


def test_csv_settings_are_parsed() -> None:
    settings = Settings(
        app_allowed_origins="http://localhost:3000,https://tutor.caps-labs.com",
        llm_fallback_providers="gemini,deepseek",
    )

    assert settings.app_allowed_origins == [
        "http://localhost:3000",
        "https://tutor.caps-labs.com",
    ]
    assert settings.llm_fallback_providers == ["gemini", "deepseek"]
