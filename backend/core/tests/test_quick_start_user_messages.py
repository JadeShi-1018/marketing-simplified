"""User-facing Quick Start error mapping."""

from core.services.quick_start.user_messages import (
    LLM_ERROR_RATE_LIMITED,
    RATE_LIMIT_RETRY_AFTER_SECONDS,
    USER_MESSAGE_RATE_LIMITED,
    llm_error_response,
    user_message_for_runtime_error,
)


class TestQuickStartUserMessages:
    def test_maps_429_to_rate_limited(self):
        code, message, retry = user_message_for_runtime_error(
            RuntimeError('Gemini rate limited (HTTP 429).')
        )
        assert code == LLM_ERROR_RATE_LIMITED
        assert message == USER_MESSAGE_RATE_LIMITED
        assert retry == RATE_LIMIT_RETRY_AFTER_SECONDS

    def test_llm_error_response_includes_retry_after(self):
        payload = llm_error_response(
            error_code=LLM_ERROR_RATE_LIMITED,
            user_message=USER_MESSAGE_RATE_LIMITED,
            retry_after_seconds=30,
        )
        assert payload['error'] == 'rate_limited'
        assert payload['retry_after_seconds'] == 30
        assert '30 seconds' in payload['detail']
