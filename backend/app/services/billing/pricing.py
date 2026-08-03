from typing import Any, Literal

BillingCycle = Literal["monthly", "annual"]
PaymentMethod = Literal["card", "pix_automatic"]

# Asaas rejects charges below R$ 5,00 in production.
PRICING: dict[BillingCycle, dict[str, Any]] = {
    "monthly": {
        "amount": 5.00,
        "cycle": "MONTHLY",
        "description": "Lume Tutor Premium - Mensal",
    },
    "annual": {
        "amount": 5.00,
        "cycle": "YEARLY",
        "description": "Lume Tutor Premium - Anual",
    },
}
