from __future__ import annotations

import logging

import httpx

from app.core.config import Settings

logger = logging.getLogger(__name__)


class NotificationService:
    def __init__(self, settings: Settings) -> None:
        self.api_key = settings.resend_api_key.strip()
        default_from = "Lume Tutor <noreply@caps-labs.com>"
        self.from_email = settings.billing_email_from.strip() or default_from
        default_site = "https://ai-language-tutor.caps-labs.com"
        self.site_url = settings.billing_site_url.strip() or default_site
        self.client = httpx.AsyncClient(timeout=15)

    @property
    def enabled(self) -> bool:
        return bool(self.api_key)

    async def close(self) -> None:
        await self.client.aclose()

    async def send_premium_activated_email(
        self,
        *,
        to_email: str,
        billing_cycle: str,
        payment_method: str,
    ) -> None:
        if not self.enabled:
            logger.info(
                "Premium activation email skipped because Resend is not configured",
                extra={"operation": "premium_activation_email", "billing_cycle": billing_cycle},
            )
            return

        method_label = "cartão de crédito" if payment_method == "card" else "PIX automático"
        cycle_label = "mensal" if billing_cycle == "monthly" else "anual"
        html = f"""
        <p>Olá!</p>
        <p>
          Seu pagamento foi confirmado e o
          <strong>Lume Premium</strong> ({cycle_label}) já está ativo.
        </p>
        <p>Forma de pagamento: {method_label}.</p>
        <p><a href="{self.site_url}/#/dashboard">Abrir o Lume Tutor</a></p>
        <p>Obrigado por apoiar seu aprendizado de idiomas.</p>
        """

        try:
            response = await self.client.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": self.from_email,
                    "to": [to_email],
                    "subject": "Lume Premium ativado",
                    "html": html,
                },
            )
        except httpx.HTTPError as exc:
            logger.exception(
                "Failed to send premium activation email",
                extra={"operation": "premium_activation_email", "error_type": type(exc).__name__},
            )
            return

        if response.status_code >= 400:
            logger.warning(
                "Resend rejected premium activation email",
                extra={
                    "operation": "premium_activation_email",
                    "http_status": response.status_code,
                },
            )
