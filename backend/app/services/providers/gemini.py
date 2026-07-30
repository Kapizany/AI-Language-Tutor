from typing import Any

import httpx

from app.schemas.llm import TutorReplyRequest
from app.services.providers.base import LLMProvider, ProviderResult
from app.services.providers.common import (
    SYSTEM_PROMPT,
    build_user_prompt,
    calculate_cost,
    parse_tutor_reply,
)


class GeminiProvider(LLMProvider):
    name = "gemini"

    def __init__(
        self,
        *,
        model: str,
        api_key: str,
        timeout_seconds: float,
        max_output_tokens: int,
        input_usd_per_million: float,
        output_usd_per_million: float,
    ) -> None:
        self.model = model
        self.api_key = api_key
        self.input_usd_per_million = input_usd_per_million
        self.output_usd_per_million = output_usd_per_million
        self.max_output_tokens = max_output_tokens
        self.client = httpx.AsyncClient(
            base_url="https://generativelanguage.googleapis.com",
            timeout=timeout_seconds,
        )

    async def generate_tutor_reply(self, request: TutorReplyRequest) -> ProviderResult:
        if not self.api_key:
            raise RuntimeError("Gemini API key is not configured")
        response = await self.client.post(
            f"/v1beta/models/{self.model}:generateContent",
            params={"key": self.api_key},
            json={
                "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
                "contents": [{"role": "user", "parts": [{"text": build_user_prompt(request)}]}],
                "generationConfig": {
                    "temperature": 0.3,
                    "maxOutputTokens": self.max_output_tokens,
                    "responseMimeType": "application/json",
                },
            },
        )
        response.raise_for_status()
        payload: dict[str, Any] = response.json()
        usage = payload.get("usageMetadata", {})
        input_tokens = int(usage.get("promptTokenCount", 0))
        # Gemini bills generated content and thinking tokens as output.
        output_tokens = int(usage.get("candidatesTokenCount", 0)) + int(
            usage.get("thoughtsTokenCount", 0)
        )
        raw_content = payload["candidates"][0]["content"]["parts"][0]["text"]
        result = parse_tutor_reply(raw_content)
        return ProviderResult(
            result=result,
            provider=self.name,
            model=self.model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            estimated_cost_usd=calculate_cost(
                input_tokens,
                output_tokens,
                self.input_usd_per_million,
                self.output_usd_per_million,
            ),
        )

    async def close(self) -> None:
        await self.client.aclose()
