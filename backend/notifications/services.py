from __future__ import annotations

import logging
from typing import Iterable, Sequence

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import QuerySet

from .dispatch import maybe_dispatch_external_channels
from .models import (
    DEADLINE_TAB_EVENT_TYPES,
    MENTION_TAB_EVENT_TYPES,
    Notification,
    NotificationEventType,
    UserNotificationPreference,
    default_notification_preferences,
)

logger = logging.getLogger(__name__)
User = get_user_model()

PREFERENCE_SECTION_KEYS = (
    "collaboration_assets",
    "core_business",
    "automation_system",
    "integrations",
)

# event_type -> (section, row_key) for UserNotificationPreference JSON
_EVENT_PREFERENCE_KEY: dict[str, tuple[str, str]] = {
    NotificationEventType.CHAT_NEW_MESSAGE: ("collaboration_assets", "chat_in_app"),
    NotificationEventType.CHAT_NEW_CONVERSATION: ("collaboration_assets", "chat_new_session"),
    NotificationEventType.PROJECT_INVITE: ("collaboration_assets", "project_invite"),
    NotificationEventType.CALENDAR_REMINDER: ("collaboration_assets", "calendar_reminders"),
    NotificationEventType.DOC_ASSET_UPDATE: ("collaboration_assets", "doc_asset_updates"),
    NotificationEventType.MEETING_CREATED: ("core_business", "meeting_created_updated"),
    NotificationEventType.MEETING_UPDATED: ("core_business", "meeting_created_updated"),
    NotificationEventType.MEETING_PARTICIPANT_ADDED: ("core_business", "meeting_participant_assign"),
    NotificationEventType.MEETING_PARTICIPANT_REMOVED: ("core_business", "meeting_participant_assign"),
    NotificationEventType.MEETING_STARTING_SOON: ("core_business", "meeting_starting_soon"),
    NotificationEventType.MEETING_AGENDA_CHANGED: ("core_business", "meeting_agenda_minutes"),
    NotificationEventType.MEETING_MINUTES_PUBLISHED: ("core_business", "meeting_agenda_minutes"),
    NotificationEventType.TASK_ASSIGNED: ("core_business", "task_assignee"),
    NotificationEventType.TASK_OWNER_CHANGED: ("core_business", "task_assignee"),
    NotificationEventType.TASK_STATUS_CHANGED: ("core_business", "task_status"),
    NotificationEventType.TASK_DEADLINE_SOON: ("core_business", "task_deadline"),
    NotificationEventType.TASK_OVERDUE: ("core_business", "task_deadline"),
    NotificationEventType.TASK_COMMENT_MENTION: ("core_business", "task_mention"),
    NotificationEventType.TASK_ANOMALY: ("core_business", "task_alert"),
    NotificationEventType.DECISION_REVIEW_NEEDED: ("core_business", "decision_review"),
    NotificationEventType.DECISION_DEADLINE: ("core_business", "decision_deadline"),
    NotificationEventType.DECISION_PUBLISHED: ("core_business", "decision_published"),
    NotificationEventType.BUDGET_APPROVAL_RESULT: ("automation_system", "approval_budget_member"),
    NotificationEventType.WORKFLOW_NODE: ("automation_system", "workflow_nodes"),
    NotificationEventType.ACCOUNT_PERMISSION: ("automation_system", "account_security_billing"),
    NotificationEventType.BILLING_ANOMALY: ("automation_system", "account_security_billing"),
    NotificationEventType.SYSTEM: ("automation_system", "workflow_nodes"),
}

# Maps notification event_type to user_preferences.NotificationSettings.setting_key (legacy)
EVENT_TO_SETTING_KEY: dict[str, str] = {}


def _setting_key_for_event(event_type: str) -> str:
    return EVENT_TO_SETTING_KEY.get(event_type, event_type)


def _legacy_notification_settings_blocks_in_app(user, event_type: str) -> bool:
    """
    If the user has NotificationSettings rows for this trigger but all are disabled,
    block in-app delivery. If there are no rows, do not block (backward compatible).
    """
    try:
        from user_preferences.models import NotificationSettings
    except Exception:  # pragma: no cover
        return False

    key = _setting_key_for_event(event_type)
    qs = NotificationSettings.objects.filter(user=user, setting_key=key)
    if not qs.exists():
        return False
    return not qs.filter(enabled=True).exists()


def _get_or_create_prefs(user) -> UserNotificationPreference:
    prefs, _ = UserNotificationPreference.objects.get_or_create(
        user=user,
        defaults={"preferences": default_notification_preferences()},
    )
    return prefs


def _is_in_app_enabled(user, event_type: str) -> bool:
    data = coalesce_preferences(_get_or_create_prefs(user).preferences)
    if data.get("disable_all"):
        return False
    mapped = _EVENT_PREFERENCE_KEY.get(event_type)
    if not mapped:
        return True
    section, key = mapped
    section_data = data.get(section) or {}
    row = section_data.get(key) or {}
    return bool(row.get("web", True))


def is_email_enabled(user, event_type: str) -> bool:
    data = coalesce_preferences(_get_or_create_prefs(user).preferences)
    if data.get("disable_all"):
        return False
    mapped = _EVENT_PREFERENCE_KEY.get(event_type)
    if not mapped:
        return True
    section, key = mapped
    row = (data.get(section) or {}).get(key) or {}
    return bool(row.get("email", True))


def is_slack_integration_enabled(user) -> bool:
    data = coalesce_preferences(_get_or_create_prefs(user).preferences)
    if data.get("disable_all"):
        return False
    row = (data.get("integrations") or {}).get("slack_webhook") or {}
    return bool(row.get("web", True))


def coalesce_preferences(stored: dict | None) -> dict:
    """
    Merge defaults with stored JSON and migrate legacy keys (meetings/tasks/decisions/approval_system).
    """
    base = default_notification_preferences()
    if not stored:
        return base

    raw = dict(stored)

    if "meetings" in raw:
        m = raw.pop("meetings", {}) or {}
        cb = dict(base["core_business"])
        if "created_updated" in m:
            cb["meeting_created_updated"] = {**cb.get("meeting_created_updated", {}), **m["created_updated"]}
        if "join_remove" in m:
            cb["meeting_participant_assign"] = {**cb.get("meeting_participant_assign", {}), **m["join_remove"]}
        if "starting_soon" in m:
            cb["meeting_starting_soon"] = {**cb.get("meeting_starting_soon", {}), **m["starting_soon"]}
        if "agenda_changed" in m:
            cb["meeting_agenda_minutes"] = {**cb.get("meeting_agenda_minutes", {}), **m["agenda_changed"]}
        base["core_business"] = {**base["core_business"], **cb}

    if "tasks" in raw:
        t = raw.pop("tasks", {}) or {}
        cb = dict(base["core_business"])
        mapping = {
            "assignee_change": "task_assignee",
            "deadline_soon": "task_deadline",
            "deadline_overdue": "task_deadline",
            "status_change": "task_status",
            "comment_mention": "task_mention",
            "anomaly": "task_alert",
        }
        for old_k, new_k in mapping.items():
            if old_k in t:
                cb[new_k] = {**(cb.get(new_k) or {}), **t[old_k]}
        base["core_business"] = {**base["core_business"], **cb}

    if "decisions" in raw:
        d = raw.pop("decisions", {}) or {}
        cb = dict(base["core_business"])
        dm = {
            "review_needed": "decision_review",
            "deadline": "decision_deadline",
            "published": "decision_published",
        }
        for old_k, new_k in dm.items():
            if old_k in d:
                cb[new_k] = {**(cb.get(new_k) or {}), **d[old_k]}
        base["core_business"] = {**base["core_business"], **cb}

    if "approval_system" in raw:
        a = raw.pop("approval_system", {}) or {}
        au = dict(base["automation_system"])
        am = {
            "budget": "approval_budget_member",
            "project_invite": "approval_budget_member",
            "workflow": "workflow_nodes",
            "account_permission": "account_security_billing",
            "billing": "account_security_billing",
        }
        for old_k, new_k in am.items():
            if old_k in a:
                au[new_k] = {**(au.get(new_k) or {}), **a[old_k]}
        base["automation_system"] = {**base["automation_system"], **au}

    if "disable_all" in raw:
        base["disable_all"] = bool(raw["disable_all"])

    for sec in PREFERENCE_SECTION_KEYS:
        if sec in raw and isinstance(raw[sec], dict):
            merged = {**base.get(sec, {}), **raw[sec]}
            for row_k, row_v in merged.items():
                default_row = base.get(sec, {}).get(row_k)
                if isinstance(row_v, dict) and isinstance(default_row, dict):
                    merged[row_k] = {**default_row, **row_v}
                elif isinstance(row_v, dict):
                    merged[row_k] = row_v
            base[sec] = merged

    return _normalize_preference_sections(base)


def _normalize_preference_sections(data: dict) -> dict:
    """Ensure every known row is a {web, email} dict so API responses never contain null/invalid rows."""
    defaults = default_notification_preferences()
    out = {**data}
    out["disable_all"] = bool(out.get("disable_all", False))
    for sec in PREFERENCE_SECTION_KEYS:
        sec_def = defaults.get(sec) or {}
        sec_in = out.get(sec)
        if not isinstance(sec_in, dict):
            out[sec] = {k: dict(v) for k, v in sec_def.items()}
            continue
        fixed: dict = {}
        for row_key, default_row in sec_def.items():
            row_val = sec_in.get(row_key)
            if isinstance(row_val, dict):
                fixed[row_key] = {
                    "web": bool(row_val.get("web", default_row["web"])),
                    "email": bool(row_val.get("email", default_row["email"])),
                }
            else:
                fixed[row_key] = dict(default_row)
        out[sec] = fixed
    return out


@transaction.atomic
def create_notification(
    *,
    recipient_id: int,
    actor_id: int | None,
    category: str,
    event_type: str,
    title: str,
    body: str = "",
    related_object_type: str = "",
    related_object_id: str = "",
    action_url: str = "",
    metadata: dict | None = None,
) -> Notification | None:
    if recipient_id == actor_id:
        return None

    try:
        recipient = User.objects.get(pk=recipient_id)
    except User.DoesNotExist:
        logger.warning("create_notification: recipient %s does not exist", recipient_id)
        return None

    if not _is_in_app_enabled(recipient, event_type):
        return None

    if _legacy_notification_settings_blocks_in_app(recipient, event_type):
        return None

    n = Notification.objects.create(
        recipient_id=recipient_id,
        actor_id=actor_id,
        category=category,
        event_type=event_type,
        related_object_type=related_object_type or "",
        related_object_id=str(related_object_id) if related_object_id is not None else "",
        title=title[:255],
        body=body or "",
        action_url=action_url[:1024] if action_url else "",
        metadata=metadata or {},
    )
    maybe_dispatch_external_channels(notification=n, user=recipient, event_type=event_type)
    return n


def create_notifications_for_users(
    *,
    recipient_ids: Iterable[int],
    actor_id: int | None,
    category: str,
    event_type: str,
    title: str,
    body: str = "",
    related_object_type: str = "",
    related_object_id: str = "",
    action_url: str = "",
    metadata: dict | None = None,
) -> list[Notification]:
    created: list[Notification] = []
    for rid in set(recipient_ids):
        n = create_notification(
            recipient_id=rid,
            actor_id=actor_id,
            category=category,
            event_type=event_type,
            title=title,
            body=body,
            related_object_type=related_object_type,
            related_object_id=related_object_id,
            action_url=action_url,
            metadata=metadata,
        )
        if n:
            created.append(n)
    return created


def filter_notifications_for_user(
    qs: QuerySet[Notification],
    *,
    category: str | None,
    is_read: bool | None,
    tab: str | None,
) -> QuerySet[Notification]:
    if category:
        qs = qs.filter(category=category)
    if is_read is not None:
        qs = qs.filter(is_read=is_read)
    t = (tab or "all").lower()
    if t == "unread":
        qs = qs.filter(is_read=False)
    elif t == "mentions":
        qs = qs.filter(event_type__in=MENTION_TAB_EVENT_TYPES)
    elif t == "deadlines":
        qs = qs.filter(event_type__in=DEADLINE_TAB_EVENT_TYPES)
    return qs


def mark_notifications_read(user, ids: Sequence[str], *, mark_all: bool = False) -> int:
    qs = Notification.objects.filter(recipient=user)
    if mark_all:
        return qs.filter(is_read=False).update(is_read=True)
    if not ids:
        return 0
    return qs.filter(id__in=ids).update(is_read=True)


def clear_notifications(
    user,
    *,
    scope: str,
    ids: Sequence[str] | None = None,
) -> int:
    qs = Notification.objects.filter(recipient=user)
    scope = (scope or "ids").lower()
    if scope == "all":
        count, _ = qs.delete()
        return count
    if scope == "read":
        count, _ = qs.filter(is_read=True).delete()
        return count
    if scope == "ids" and ids:
        count, _ = qs.filter(id__in=ids).delete()
        return count
    return 0


def merge_preferences_update(existing: dict | None, patch: dict) -> dict:
    """Apply a PATCH on top of coalesced preferences (includes legacy migration)."""
    base = coalesce_preferences(existing)
    if "disable_all" in patch:
        base["disable_all"] = bool(patch["disable_all"])
    for section in PREFERENCE_SECTION_KEYS:
        if section not in patch or not isinstance(patch[section], dict):
            continue
        sec_defaults = default_notification_preferences().get(section) or {}
        sec_base = {**sec_defaults, **(base.get(section) or {})}
        for row_key, row_val in patch[section].items():
            if isinstance(row_val, dict):
                prev = {**(sec_base.get(row_key) or {})}
                for k in ("web", "email"):
                    if k in row_val:
                        prev[k] = bool(row_val[k])
                sec_base[row_key] = prev
        base[section] = sec_base
    return base


def apply_and_save_notification_preferences(user, patch: dict) -> UserNotificationPreference:
    """
    Ensure a UserNotificationPreference row exists for this user, merge the partial patch,
    and persist. Preferences are stored as one JSON document per user (section -> row -> web/email),
    not as separate NotificationSetting rows.

    Uses update_or_create pattern to handle race conditions and ensure the preference
    record always exists before updating.
    """
    with transaction.atomic():
        try:
            pref, created = UserNotificationPreference.objects.get_or_create(
                user=user,
                defaults={"preferences": default_notification_preferences()},
            )
            if created:
                logger.debug(
                    "Created new UserNotificationPreference for user_id=%s",
                    getattr(user, "pk", None),
                )
        except IntegrityError:
            logger.warning(
                "get_or_create race for user_id=%s; retrying get_or_create",
                getattr(user, "pk", None),
            )
            # Use get_or_create again instead of get() to handle edge cases
            # where the record might not exist after a concurrent rollback
            pref, _ = UserNotificationPreference.objects.get_or_create(
                user=user,
                defaults={"preferences": default_notification_preferences()},
            )
        pref.preferences = merge_preferences_update(pref.preferences, patch)
        pref.save(update_fields=["preferences", "updated_at"])
        return pref
