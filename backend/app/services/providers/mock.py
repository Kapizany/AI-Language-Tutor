import json
import re

from app.schemas.llm import LLMTask
from app.services.providers.base import CompletionRequest, CompletionResult, LLMProvider

_TARGET_LANGUAGE = re.compile(r"^Target language: .*\((\w{2})\)", re.MULTILINE)
_LAST_LEARNER_MESSAGE = re.compile(r"<learner_message>(.*?)</learner_message>", re.DOTALL)

_REPLY_BY_LANGUAGE = {
    "en": "Great start! What would you like to say next?",
    "es": "¡Buen comienzo! ¿Qué te gustaría decir ahora?",
    "fr": "Très bon début ! Qu’aimeriez-vous dire ensuite ?",
    "it": "Ottimo inizio! Cosa vorresti dire adesso?",
}


class MockProvider(LLMProvider):
    """Provedor determinístico para testes e desenvolvimento local sem custo.

    Ele lê o idioma e a mensagem do próprio prompt porque o contrato do provedor é
    intencionalmente genérico: os adaptadores reais só recebem texto.
    """

    name = "mock"
    model = "deterministic-tutor-v1"

    async def complete(self, request: CompletionRequest) -> CompletionResult:
        if request.task is LLMTask.SESSION_SUMMARY:
            content = self._summary_content()
        else:
            content = self._tutor_content(request.user_prompt)
        input_tokens = max(1, (len(request.system_prompt) + len(request.user_prompt)) // 4)
        return CompletionResult(
            content=content,
            input_tokens=input_tokens,
            output_tokens=max(1, len(content) // 4),
            estimated_cost_usd=0,
        )

    def _tutor_content(self, user_prompt: str) -> str:
        language_match = _TARGET_LANGUAGE.search(user_prompt)
        language = language_match.group(1) if language_match else "en"
        message_match = _LAST_LEARNER_MESSAGE.search(user_prompt)
        learner_message = (message_match.group(1) if message_match else "").strip()

        correction = None
        if learner_message.lower() == "i want one coffee":
            correction = {
                "original": learner_message,
                "corrected": "I'd like a coffee, please.",
                "explanation_pt_br": "Em pedidos, “I'd like...” soa mais natural e educado.",
                "severity": "minor",
            }
        return json.dumps(
            {
                "reply": _REPLY_BY_LANGUAGE.get(language, _REPLY_BY_LANGUAGE["en"]),
                "correction": correction,
                "should_retry": False,
            }
        )

    def _summary_content(self) -> str:
        return json.dumps(
            {
                "headline_pt_br": "Você manteve a conversa até o fim",
                "encouragement_pt_br": "Boa prática! Você respondeu no contexto do cenário.",
                "strengths_pt_br": ["Respondeu no contexto", "Usou frases completas"],
                "focus_areas": [
                    {
                        "title_pt_br": "Pedidos mais naturais",
                        "detail_pt_br": "Prefira “I'd like...” a “I want...”.",
                    }
                ],
                "vocabulary": [{"term": "large", "translation_pt_br": "grande"}],
                "objective_progress": 70,
            }
        )
