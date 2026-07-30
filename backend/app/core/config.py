from functools import lru_cache
from typing import Annotated

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "development"
    app_allowed_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:3000"]
    )

    supabase_url: str = ""
    supabase_publishable_key: str = ""
    supabase_service_role_key: str = ""
    supabase_jwt_secret: str = ""

    llm_primary_provider: str = "gemini"
    llm_fallback_providers: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["deepseek"]
    )
    llm_request_timeout_seconds: float = 20
    llm_max_output_tokens: int = 1_024
    llm_max_retries: int = 2
    llm_circuit_failure_threshold: int = 3
    llm_circuit_recovery_seconds: int = 30
    llm_max_cost_per_request_usd: float = 0.02

    deepseek_api_key: str = ""
    deepseek_model: str = "deepseek-v4-flash"
    # Cache-miss price is intentionally used for conservative cost accounting.
    deepseek_input_usd_per_million: float = 0.14
    deepseek_output_usd_per_million: float = 0.28

    kimi_api_key: str = ""
    kimi_model: str = "moonshot-v1-8k"
    kimi_input_usd_per_million: float = 0
    kimi_output_usd_per_million: float = 0

    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash-lite"
    gemini_input_usd_per_million: float = 0.10
    gemini_output_usd_per_million: float = 0.40

    @field_validator("app_allowed_origins", "llm_fallback_providers", mode="before")
    @classmethod
    def split_csv(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @model_validator(mode="after")
    def validate_production_secrets(self) -> "Settings":
        if self.app_env == "production":
            required = {
                "SUPABASE_URL": self.supabase_url,
                "SUPABASE_SERVICE_ROLE_KEY": self.supabase_service_role_key,
                "GEMINI_API_KEY": self.gemini_api_key,
                "DEEPSEEK_API_KEY": self.deepseek_api_key,
            }
            missing = [name for name, value in required.items() if not value]
            if missing:
                raise ValueError(f"Missing required production settings: {', '.join(missing)}")
        return self

    @property
    def supabase_issuer(self) -> str:
        return f"{self.supabase_url.rstrip('/')}/auth/v1"

    @property
    def supabase_jwks_url(self) -> str:
        return f"{self.supabase_issuer}/.well-known/jwks.json"


@lru_cache
def get_settings() -> Settings:
    return Settings()
