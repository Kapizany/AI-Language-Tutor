from app.core.config import Settings
from app.services.gateway import LLMGateway
from app.services.providers.base import LLMProvider
from app.services.providers.gemini import GeminiProvider
from app.services.providers.mock import MockProvider
from app.services.providers.openai_compatible import OpenAICompatibleProvider


def build_provider(name: str, settings: Settings) -> LLMProvider:
    if name == "mock":
        return MockProvider()
    if name == "deepseek":
        _validate_pricing(
            name,
            settings.deepseek_input_usd_per_million,
            settings.deepseek_output_usd_per_million,
        )
        return OpenAICompatibleProvider(
            name="deepseek",
            model=settings.deepseek_model,
            base_url="https://api.deepseek.com",
            api_key=settings.deepseek_api_key,
            timeout_seconds=settings.llm_request_timeout_seconds,
            max_output_tokens=settings.llm_max_output_tokens,
            input_usd_per_million=settings.deepseek_input_usd_per_million,
            output_usd_per_million=settings.deepseek_output_usd_per_million,
        )
    if name == "kimi":
        _validate_pricing(
            name,
            settings.kimi_input_usd_per_million,
            settings.kimi_output_usd_per_million,
        )
        return OpenAICompatibleProvider(
            name="kimi",
            model=settings.kimi_model,
            base_url="https://api.moonshot.ai/v1",
            api_key=settings.kimi_api_key,
            timeout_seconds=settings.llm_request_timeout_seconds,
            max_output_tokens=settings.llm_max_output_tokens,
            input_usd_per_million=settings.kimi_input_usd_per_million,
            output_usd_per_million=settings.kimi_output_usd_per_million,
        )
    if name == "gemini":
        _validate_pricing(
            name,
            settings.gemini_input_usd_per_million,
            settings.gemini_output_usd_per_million,
        )
        return GeminiProvider(
            model=settings.gemini_model,
            api_key=settings.gemini_api_key,
            timeout_seconds=settings.llm_request_timeout_seconds,
            max_output_tokens=settings.llm_max_output_tokens,
            input_usd_per_million=settings.gemini_input_usd_per_million,
            output_usd_per_million=settings.gemini_output_usd_per_million,
        )
    raise ValueError(f"Unsupported LLM provider: {name}")


def _validate_pricing(name: str, input_price: float, output_price: float) -> None:
    if input_price <= 0 or output_price <= 0:
        raise ValueError(f"{name} token prices must be configured before enabling the provider")


def build_gateway(settings: Settings) -> LLMGateway:
    names = [settings.llm_primary_provider, *settings.llm_fallback_providers]
    providers = [build_provider(name, settings) for name in dict.fromkeys(names)]
    return LLMGateway(
        providers,
        max_retries=settings.llm_max_retries,
        failure_threshold=settings.llm_circuit_failure_threshold,
        recovery_seconds=settings.llm_circuit_recovery_seconds,
    )
