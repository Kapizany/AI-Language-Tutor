from app.schemas.llm import Correction, TutorReply, TutorReplyRequest
from app.services.providers.base import LLMProvider, ProviderResult


class MockProvider(LLMProvider):
    name = "mock"
    model = "deterministic-tutor-v1"

    async def generate_tutor_reply(self, request: TutorReplyRequest) -> ProviderResult:
        reply_by_language = {
            "en": "Great start! What would you like to say next?",
            "es": "¡Buen comienzo! ¿Qué te gustaría decir ahora?",
            "fr": "Très bon début ! Qu’aimeriez-vous dire ensuite ?",
            "it": "Ottimo inizio! Cosa vorresti dire adesso?",
        }
        correction = None
        if request.message.strip().lower() == "i want one coffee":
            correction = Correction(
                original=request.message,
                corrected="I'd like a coffee, please.",
                explanation_pt_br="Em pedidos, “I'd like...” soa mais natural e educado.",
                severity="minor",
            )
        result = TutorReply(
            reply=reply_by_language[request.target_language.value],
            correction=correction,
        )
        input_tokens = max(1, len(request.message) // 4)
        output_tokens = max(1, len(result.reply) // 4)
        return ProviderResult(
            result=result,
            provider=self.name,
            model=self.model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            estimated_cost_usd=0,
        )
