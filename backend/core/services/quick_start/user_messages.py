"""User-facing Quick Start / Gemini error messages (no technical jargon)."""

from __future__ import annotations

# API `error` field values returned to the frontend.
LLM_ERROR_RATE_LIMITED = 'rate_limited'
LLM_ERROR_MALFORMED_OUTPUT = 'malformed_output'
LLM_ERROR_NETWORK = 'network_error'
LLM_ERROR_GENERIC = 'llm_generation_failed'
LLM_ERROR_CONFIGURATION = 'configuration_error'

RATE_LIMIT_RETRY_AFTER_SECONDS = 30

USER_MESSAGE_RATE_LIMITED = (
    'AI requests are coming in too quickly. Please wait 30 seconds, then try again.'
)
USER_MESSAGE_MALFORMED_OUTPUT = (
    'We could not finish building your draft. Please try Generate preview again.'
)
USER_MESSAGE_NETWORK = (
    'We could not reach the AI service. Check your connection and try again.'
)
USER_MESSAGE_GENERIC = (
    'We could not generate a preview right now. Please try again in a moment.'
)
USER_MESSAGE_CONFIGURATION = (
    'AI setup is not complete. Ask your administrator to configure the Gemini API key.'
)


def llm_error_response(
    *,
    error_code: str,
    user_message: str,
    retry_after_seconds: int | None = None,
) -> dict[str, str | int]:
    payload: dict[str, str | int] = {
        'error': error_code,
        'detail': user_message,
    }
    if retry_after_seconds is not None:
        payload['retry_after_seconds'] = retry_after_seconds
    return payload


def user_message_for_runtime_error(exc: BaseException) -> tuple[str, str, int | None]:
    """
    Map a Gemini RuntimeError (or similar) to (error_code, user_message, retry_after_seconds).
    """
    text = str(exc).lower()

    if '429' in text or 'rate-limited' in text or 'rate limited' in text or 'too many requests' in text:
        return (
            LLM_ERROR_RATE_LIMITED,
            USER_MESSAGE_RATE_LIMITED,
            RATE_LIMIT_RETRY_AFTER_SECONDS,
        )

    if 'malformed' in text or 'not valid json' in text or 'non-json' in text:
        return LLM_ERROR_MALFORMED_OUTPUT, USER_MESSAGE_MALFORMED_OUTPUT, None

    if 'network' in text:
        return LLM_ERROR_NETWORK, USER_MESSAGE_NETWORK, None

    if 'gemini_api_key' in text or 'not configured' in text:
        return LLM_ERROR_CONFIGURATION, USER_MESSAGE_CONFIGURATION, None

    return LLM_ERROR_GENERIC, USER_MESSAGE_GENERIC, None
