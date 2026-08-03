from typing import Any, Literal

BillingCycle = Literal["monthly", "annual"]
PaymentMethod = Literal["card", "pix_automatic"]

PRICING: dict[BillingCycle, dict[str, Any]] = {
    "monthly": {
        "amount": 19.90,
        "cycle": "MONTHLY",
        "description": "Lume Tutor Premium - Mensal",
    },
    "annual": {
        "amount": 179.10,
        "cycle": "YEARLY",
        "description": "Lume Tutor Premium - Anual",
    },
}
