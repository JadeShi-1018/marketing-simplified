import re

from django.core.exceptions import ValidationError
from rest_framework import status as drf_status
from rest_framework.response import Response

from .models import DecisionEdge

INVALID_STATE_ERROR_CODE = "INVALID_STATE_TRANSITION"
INVALID_STATE_MESSAGE = "This operation is not allowed in the current state."

DECISION_TOPIC_LABELS = {
    "tiktok_growth": "TikTok Growth",
    "google_search": "Google Search",
    "meta_retargeting": "Meta Retargeting",
    "email_lifecycle": "Email Lifecycle",
    "landing_page_cro": "Landing Page CRO",
    "influencer_ugc": "Influencer / UGC",
    "awareness": "Awareness",
    "other": "Other",
}

DECISION_TOPIC_RULES = [
    ("tiktok_growth", ("tiktok", "spark ads", "spark", "tik tok")),
    ("google_search", ("google", "google search", "paid search", "search", "keyword", "keywords", "query", "queries")),
    ("meta_retargeting", ("meta", "facebook", "instagram", "retarget", "retargeting")),
    ("email_lifecycle", ("email", "lifecycle", "welcome flow", "abandoned cart", "winback", "post-purchase")),
    ("landing_page_cro", ("landing page", "cro", "checkout", "conversion", "hero section", "bundle page")),
    ("influencer_ugc", ("influencer", "ugc", "creator", "whitelisting", "usage rights")),
]

DECISION_TOPIC_STOPWORDS = {
    "and",
    "for",
    "new",
    "test",
    "the",
    "with",
}


def normalize_decision_topic(topic: str | None) -> str:
    value = re.sub(r"[^a-z0-9]+", "_", (topic or "").strip().lower()).strip("_")
    return value[:64] or "other"


def decision_topic_label(topic: str | None) -> str:
    normalized = normalize_decision_topic(topic)
    if normalized in DECISION_TOPIC_LABELS:
        return DECISION_TOPIC_LABELS[normalized]
    return " ".join(part.capitalize() for part in normalized.split("_") if part) or DECISION_TOPIC_LABELS["other"]


def infer_dynamic_decision_topic(title: str | None) -> str:
    for raw_token in re.findall(r"[a-zA-Z][a-zA-Z0-9]*", title or ""):
        token = re.sub(r"\d+$", "", raw_token.lower())
        if len(token) < 3 or token in DECISION_TOPIC_STOPWORDS:
            continue
        return normalize_decision_topic(token)
    return "other"


def infer_decision_topic(
    title: str | None,
    fallback: str = "other",
    existing_topics: set[str] | None = None,
) -> str:
    value = (title or "").lower()
    for topic, terms in DECISION_TOPIC_RULES:
        if any(term in value for term in terms):
            return topic
    title_tokens = {
        re.sub(r"\d+$", "", raw_token.lower())
        for raw_token in re.findall(r"[a-zA-Z][a-zA-Z0-9]*", title or "")
    }
    reusable_topics = sorted(
        (
            normalize_decision_topic(topic)
            for topic in (existing_topics or set())
            if normalize_decision_topic(topic) != "other"
        ),
        key=len,
        reverse=True,
    )
    for topic in reusable_topics:
        topic_tokens = [part for part in topic.split("_") if part]
        if any(token in title_tokens for token in topic_tokens):
            return topic
    dynamic_topic = infer_dynamic_decision_topic(title)
    if dynamic_topic != "other":
        return dynamic_topic
    return normalize_decision_topic(fallback)

def invalid_state_response(
    *, current_status: str, allowed_statuses: list[str], suggested_action: str
):
    return Response(
        {
            "errorCode": INVALID_STATE_ERROR_CODE,
            "message": INVALID_STATE_MESSAGE,
            "details": {
                "currentStatus": current_status,
                "allowedStatuses": allowed_statuses,
                "suggestedAction": suggested_action,
            },
        },
        status=drf_status.HTTP_409_CONFLICT,
    )


def generate_signal_text(
    *,
    metric: str,
    movement: str,
    period: str,
    comparison: str | None = None,
    scope_type: str | None = None,
    scope_value: str | None = None,
    delta_value: str | None = None,
    delta_unit: str | None = None,
) -> str:
    parts = [metric, movement, period]
    if comparison and comparison != "NONE":
        parts.append(f"vs {comparison}")
    if scope_type:
        if scope_value:
            parts.append(f"{scope_type}: {scope_value}")
        else:
            parts.append(scope_type)
    if delta_value is not None and delta_unit:
        parts.append(f"{delta_value} {delta_unit}")
    return " | ".join(parts)


def _has_path(start_id: int, target_id: int) -> bool:
    if start_id == target_id:
        return True
    visited = set()
    stack = [start_id]
    while stack:
        current = stack.pop()
        if current in visited:
            continue
        visited.add(current)
        if current == target_id:
            return True
        children = DecisionEdge.objects.filter(
            from_decision_id=current
        ).values_list("to_decision_id", flat=True)
        for child in children:
            if child not in visited:
                stack.append(child)
    return False


def validate_decision_edge(from_decision, to_decision):
    if from_decision.id == to_decision.id:
        raise ValidationError({"parentDecisionIds": "Decision cannot reference itself."})
    if _has_path(to_decision.id, from_decision.id):
        raise ValidationError({"parentDecisionIds": "Adding this parent introduces a cycle."})
