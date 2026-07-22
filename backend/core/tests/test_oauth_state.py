import pytest
from django.core.cache import cache
from django.test import override_settings

from core.services.oauth_state import (
    OAuthStateExpired,
    OAuthStateInvalid,
    create_oauth_state,
    validate_oauth_state,
)


LOC_MEM_CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "oauth-state-tests",
    }
}


@override_settings(CACHES=LOC_MEM_CACHES)
def test_oauth_state_is_hmac_signed_and_single_use():
    cache.clear()
    state = create_oauth_state(flow="test-flow", payload={"user_id": 123}, ttl_seconds=60)

    payload = validate_oauth_state(state, expected_flow="test-flow", ttl_seconds=60)

    assert payload["user_id"] == 123
    with pytest.raises(OAuthStateExpired):
        validate_oauth_state(state, expected_flow="test-flow", ttl_seconds=60)


@override_settings(CACHES=LOC_MEM_CACHES)
def test_oauth_state_rejects_tampering():
    cache.clear()
    state = create_oauth_state(flow="test-flow", payload={"user_id": 123}, ttl_seconds=60)
    tampered = state[:-1] + ("x" if state[-1] != "x" else "y")

    with pytest.raises(OAuthStateInvalid):
        validate_oauth_state(tampered, expected_flow="test-flow", ttl_seconds=60)


@override_settings(CACHES=LOC_MEM_CACHES)
def test_oauth_state_rejects_expired_or_missing_nonce():
    cache.clear()
    state = create_oauth_state(flow="test-flow", payload={"user_id": 123}, ttl_seconds=60)
    cache.clear()

    with pytest.raises(OAuthStateExpired):
        validate_oauth_state(state, expected_flow="test-flow", ttl_seconds=60)


@override_settings(CACHES=LOC_MEM_CACHES)
def test_oauth_state_rejects_wrong_flow():
    cache.clear()
    state = create_oauth_state(flow="test-flow", payload={"user_id": 123}, ttl_seconds=60)

    with pytest.raises(OAuthStateInvalid):
        validate_oauth_state(state, expected_flow="other-flow", ttl_seconds=60)
