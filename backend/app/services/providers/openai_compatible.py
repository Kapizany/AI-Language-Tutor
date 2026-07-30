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


class OpenAICompatibleProvider(LLMProvider):
    def __init__(
        self,
        *,
        name: str,
        model: str,
        base_url: str,
        api_key: str,
        timeout_seconds: float,
        max_output_tokens: int,
        input_usd_per_million: float,
        output_usd_per_million: float,
    ) -> None:
        self.name = name
        self.model = model
        self.api_key = api_key
        self.input_usd_per_million = input_usd_per_million
        self.output_usd_per_million = output_usd_per_million
        self.max_output_tokens = max_output_tokens
        self.client = httpx.AsyncClient(
            base_url=base_url,
            timeout=timeout_seconds,
            headers={"Authorization": f"Bearer {api_key}"},
        )

    async def generate_tutor_reply(self, request: TutorReplyRequest) -> ProviderResult:
        if not self.api_key:
            raise RuntimeError(f"{self.name} API key is not configured")
        response = await self.client.post(
            "/chat/completions",
            json={
                "model": self.model,
                "max_tokens": self.max_output_tokens,
                "temperature": 0.3,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": build_user_prompt(request)},
                ],
            },
        )
        response.raise_for_status()
        payload: dict[str, Any] = response.json()
        usage = payload.get("usage", {})
        input_tokens = int(usage.get("prompt_tokens", 0))
        output_tokens = int(usage.get("completion_tokens", 0))
        result = parse_tutor_reply(payload["choices"][0]["message"]["content"])
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
