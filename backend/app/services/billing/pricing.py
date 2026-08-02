from typing import Any, Literal

BillingCycle = Literal["monthly", "annual"]
PaymentMethod = Literal["card", "pix_automatic"]

PRICING: dict[BillingCycle, dict[str, Any]] = {
    "monthly": {
        "amount": 2.00,
        "cycle": "MONTHLY",
        "description": "Lume Tutor Premium - Mensal",
    },
    "annual": {
        "amount": 2.00,
        "cycle": "YEARLY",
        "description": "Lume Tutor Premium - Anual",
    },
}
