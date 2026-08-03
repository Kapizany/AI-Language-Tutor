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
        error_codes: list[str] | None = None,
        provider_messages: list[str] | None = None,
        user_message: str | None = None,
        is_client_error: bool = False,
        method: str | None = None,
        path: str | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.request_id = request_id
        self.error_codes = error_codes or []
        self.provider_messages = provider_messages or []
        self.user_message = user_message
        self.is_client_error = is_client_error
        self.method = method
        self.path = path


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
