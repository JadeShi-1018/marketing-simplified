"""URL fetcher for ad_copy_variation Mode 3 (external Meta ad URL).

Vendor-agnostic interface: fetch_url_text(url) -> str returns the rendered
text content of a JS-heavy page. Default implementation calls Browserless
(managed headless browser as a service); swap vendor by overriding
BROWSERLESS_BASE env and adapting the post body if the new vendor uses a
different shape.

Token MUST NOT leak in any error message — see _safe_post for redaction
of the URL when re-raising.
"""

import logging
import os

import requests
from bs4 import BeautifulSoup
from django.conf import settings

logger = logging.getLogger(__name__)

DEFAULT_BASE = "https://chrome.browserless.io"
DEFAULT_TIMEOUT = 30
MAX_TEXT_CHARS = 20000


def _api_key() -> str:
    key = getattr(settings, "BROWSERLESS_API_KEY", "") or os.environ.get(
        "BROWSERLESS_API_KEY", ""
    )
    if not key:
        raise RuntimeError("BROWSERLESS_API_KEY is not configured")
    return key


def _base_url() -> str:
    return os.environ.get("BROWSERLESS_BASE") or DEFAULT_BASE


def _safe_post(endpoint_path: str, payload: dict, timeout: int) -> requests.Response:
    """Post to Browserless. On error, redact the URL (which contains the token) before raising."""
    url = f"{_base_url()}{endpoint_path}"
    response = requests.post(
        url,
        params={"token": _api_key()},
        json=payload,
        timeout=timeout,
    )
    if response.status_code != 200:
        logger.error(
            "Browserless call failed status=%s body=%s",
            response.status_code,
            response.text[:300],
        )
        raise RuntimeError(
            f"Browserless fetch failed: status={response.status_code}"
        )
    return response


def fetch_url_text(url: str, timeout: int = DEFAULT_TIMEOUT) -> str:
    """Fetch the URL via Browserless, return body text capped at MAX_TEXT_CHARS."""
    logger.info("Fetching via Browserless url=%s", url)
    response = _safe_post(
        "/content",
        {"url": url, "gotoOptions": {"waitUntil": "networkidle2"}},
        timeout,
    )
    soup = BeautifulSoup(response.text, "html.parser")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    text = soup.get_text(separator="\n", strip=True)
    if len(text) > MAX_TEXT_CHARS:
        text = text[:MAX_TEXT_CHARS]
    logger.info("Browserless fetch ok url=%s text_chars=%d", url, len(text))
    return text
