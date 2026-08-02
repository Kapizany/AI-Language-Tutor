class BillingServiceError(RuntimeError):
    pass


class BillingNotConfiguredError(BillingServiceError):
    pass


class BillingProviderError(BillingServiceError):
    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        request_id: str | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.request_id = request_id


class BillingSubscriptionNotFoundError(BillingServiceError):
    pass


class BillingSubscriptionNotCancelableError(BillingServiceError):
    pass


class BillingRateLimitError(BillingServiceError):
    def __init__(self, message: str, *, retry_after_seconds: int | None = None) -> None:
        super().__init__(message)
        self.retry_after_seconds = retry_after_seconds


class AlreadyPremiumError(BillingServiceError):
    pass


class BillingValidationError(BillingServiceError):
    pass
