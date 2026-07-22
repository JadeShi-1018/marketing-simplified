from __future__ import annotations

import secrets
import time
from typing import Any

from django.conf import settings
from django.core import signing
from django.core.cache import cache


DEFAULT_OAUTH_STATE_TTL_SECONDS = 600


class OAuthStateError(Exception):
    """Base class for OAuth state validation failures."""


class OAuthStateExpired(OAuthStateError):
    """State is older than its allowed TTL or missing from Redis/cache."""


class OAuthStateInvalid(OAuthStateError):
    """State is malformed, unsigned, mismatched, or already consumed."""


def _cache_key(flow: str, nonce: str) -> str:
    return f"oauth-state:{flow}:{nonce}"


def create_oauth_state(
    *,
    flow: str,
    payload: dict[str, Any] | None = None,
    ttl_seconds: int | None = None,
) -> str:
    """Create an HMAC-signed, time-bound, single-use OAuth state value."""

    ttl = int(ttl_seconds or getattr(settings, "OAUTH_STATE_TTL_SECONDS", DEFAULT_OAUTH_STATE_TTL_SECONDS))
    nonce = secrets.token_urlsafe(24)
    body = {
        "flow": flow,
        "nonce": nonce,
        "ts": int(time.time()),
        **(payload or {}),
    }
    state = signing.dumps(body, salt=flow)
    cache.set(_cache_key(flow, nonce), "1", timeout=ttl)
    return state


def validate_oauth_state(
    state: str,
    *,
    expected_flow: str,
    ttl_seconds: int | None = None,
    consume: bool = True,
) -> dict[str, Any]:
    """Validate signature, timestamp, flow, and single-use nonce."""

    if not state:
        raise OAuthStateInvalid("Missing OAuth state.")

    ttl = int(ttl_seconds or getattr(settings, "OAUTH_STATE_TTL_SECONDS", DEFAULT_OAUTH_STATE_TTL_SECONDS))
    try:
        payload = signing.loads(state, salt=expected_flow, max_age=ttl)
    except signing.SignatureExpired as exc:
        raise OAuthStateExpired("OAuth state has expired.") from exc
    except signing.BadSignature as exc:
        raise OAuthStateInvalid("Invalid OAuth state signature.") from exc

    if payload.get("flow") != expected_flow:
        raise OAuthStateInvalid("OAuth state flow mismatch.")

    nonce = payload.get("nonce")
    if not nonce:
        raise OAuthStateInvalid("OAuth state nonce is missing.")

    key = _cache_key(expected_flow, str(nonce))
    if not cache.get(key):
        raise OAuthStateExpired("OAuth state has expired or was already used.")

    if consume:
        cache.delete(key)

    return payload
