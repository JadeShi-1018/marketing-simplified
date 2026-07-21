import pytest
from django.core.cache import cache
from django.test import override_settings

from authentication.views import GOOGLE_AUTH_STATE_FLOW, GOOGLE_AUTH_STATE_TTL_SECONDS
from core.services.oauth_state import create_oauth_state
from facebook_integration.services import FB_OAUTH_STATE_MAX_AGE, FB_OAUTH_STATE_SALT
from google_calendar_integration.views import GOOGLE_CALENDAR_STATE_MAX_AGE_SECONDS, GOOGLE_CALENDAR_STATE_SALT
from google_docs_integration.views import GOOGLE_DOCS_STATE_MAX_AGE_SECONDS, GOOGLE_DOCS_STATE_SALT
from linear_integration.views import LINEAR_OAUTH_STATE_MAX_AGE_SECONDS, LINEAR_OAUTH_STATE_SALT
from notion_editor.views import NOTION_STATE_MAX_AGE_SECONDS, NOTION_STATE_SALT
from slack_integration.views import SLACK_OAUTH_STATE_MAX_AGE_SECONDS, SLACK_OAUTH_STATE_SALT
from zoom_integration.views import ZOOM_OAUTH_STATE_MAX_AGE_SECONDS, ZOOM_OAUTH_STATE_SALT


LOC_MEM_CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "oauth-callback-state-tests",
    }
}


CALLBACKS = [
    ("google_docs", "get", "/api/google-docs/callback/", GOOGLE_DOCS_STATE_SALT, GOOGLE_DOCS_STATE_MAX_AGE_SECONDS, "google_docs_error"),
    ("google_calendar", "get", "/api/google-calendar/callback/", GOOGLE_CALENDAR_STATE_SALT, GOOGLE_CALENDAR_STATE_MAX_AGE_SECONDS, "google_calendar_error"),
    ("zoom", "get", "/api/v1/zoom/callback/", ZOOM_OAUTH_STATE_SALT, ZOOM_OAUTH_STATE_MAX_AGE_SECONDS, "zoom_error"),
    ("linear", "get", "/api/v1/linear/callback/", LINEAR_OAUTH_STATE_SALT, LINEAR_OAUTH_STATE_MAX_AGE_SECONDS, "linear_error"),
    ("notion", "get", "/api/notion/callback/", NOTION_STATE_SALT, NOTION_STATE_MAX_AGE_SECONDS, "notion_error"),
    ("facebook", "get", "/api/facebook_integration/callback/", FB_OAUTH_STATE_SALT, FB_OAUTH_STATE_MAX_AGE, "facebook_error"),
    ("google_auth", "get", "/auth/google/callback/", GOOGLE_AUTH_STATE_FLOW, GOOGLE_AUTH_STATE_TTL_SECONDS, "errorCode"),
    ("slack", "post", "/api/slack/oauth/callback/", SLACK_OAUTH_STATE_SALT, SLACK_OAUTH_STATE_MAX_AGE_SECONDS, "error"),
]


def _state(flow, ttl, user):
    payload = {"user_id": user.id}
    if flow == SLACK_OAUTH_STATE_SALT:
        payload["organization_id"] = user.organization_id
    if flow == LINEAR_OAUTH_STATE_SALT:
        payload["cv"] = "code-verifier"
    return create_oauth_state(flow=flow, payload=payload, ttl_seconds=ttl)


def _call(client, method, url, state):
    data = {"code": "dummy-code", "state": state}
    if method == "post":
        return client.post(url, data, format="json")
    return client.get(url, data)


@pytest.mark.django_db
@override_settings(CACHES=LOC_MEM_CACHES)
@pytest.mark.parametrize("name,method,url,flow,ttl,error_key", CALLBACKS)
def test_oauth_callbacks_reject_replayed_or_expired_state(api_client, user, name, method, url, flow, ttl, error_key):
    cache.clear()
    api_client.force_authenticate(user=user)
    state = _state(flow, ttl, user)
    cache.clear()

    response = _call(api_client, method, url, state)

    if method == "post":
        assert response.status_code == 400
        assert error_key in response.data
        assert "expired" in str(response.data[error_key]).lower() or "invalid" in str(response.data[error_key]).lower()
    elif name == "google_auth":
        assert response.status_code == 400
        assert response.data[error_key] == "OAUTH_STATE_EXPIRED"
    else:
        assert response.status_code == 302
        assert f"{error_key}=state_expired" in response["Location"]


@pytest.mark.django_db
@override_settings(CACHES=LOC_MEM_CACHES)
@pytest.mark.parametrize("name,method,url,flow,ttl,error_key", CALLBACKS)
def test_oauth_callbacks_reject_tampered_state(api_client, user, name, method, url, flow, ttl, error_key):
    cache.clear()
    api_client.force_authenticate(user=user)
    state = _state(flow, ttl, user)
    tampered = state[:-1] + ("x" if state[-1] != "x" else "y")

    response = _call(api_client, method, url, tampered)

    if method == "post":
        assert response.status_code == 400
        assert error_key in response.data
        assert "invalid" in str(response.data[error_key]).lower()
    elif name == "google_auth":
        assert response.status_code == 400
        assert response.data[error_key] == "OAUTH_STATE_INVALID"
    else:
        assert response.status_code == 302
        assert f"{error_key}=invalid_state" in response["Location"]
