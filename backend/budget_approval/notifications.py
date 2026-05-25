"""
In-app notifications for budget request lifecycle events.
"""

from __future__ import annotations

from django.contrib.auth import get_user_model

from notifications.models import NotificationCategory, NotificationEventType
from notifications.services import create_notification, create_notifications_for_users
from notifications.action_urls import task_action_url

User = get_user_model()

CHANGE_SUBMITTED = "budget_submitted"
CHANGE_FORWARDED = "budget_forwarded"
CHANGE_APPROVED = "budget_approved"
CHANGE_REJECTED = "budget_rejected"
CHANGE_LOCKED = "budget_locked"
CHANGE_POOL_INSUFFICIENT = "budget_pool_insufficient"
CHANGE_CANCELLED = "budget_cancelled"
CHANGE_ESCALATED = "budget_escalated"


def _budget_summary(budget_request) -> str:
    task = getattr(budget_request, "task", None)
    if task and getattr(task, "summary", None):
        return task.summary
    return f"Budget Request #{budget_request.id}"


def _action_url(budget_request) -> str:
    task_id = budget_request.task_id
    if task_id:
        return task_action_url(task_id)
    return ""


def _base_metadata(budget_request, change_type: str, **extra) -> dict:
    pool = budget_request.budget_pool
    summary = _budget_summary(budget_request)
    meta = {
        "change_type": change_type,
        "project_id": pool.project_id if pool else None,
        "task_id": budget_request.task_id,
        "budget_request_id": budget_request.id,
        "amount": str(budget_request.amount),
        "currency": budget_request.currency,
        "budget_summary": summary,
        "status": budget_request.status,
    }
    if pool:
        meta["budget_pool_id"] = pool.id
        meta["budget_pool_name"] = pool.name or f"Pool #{pool.id}"
        meta["pool_available_amount"] = str(pool.available_amount)
    meta.update(extra)
    return meta


def _budget_controller_ids(project_id: int | None) -> list[int]:
    if not project_id:
        return []
    from core.models import ProjectMember

    return list(
        ProjectMember.objects.filter(
            project_id=project_id,
            role="Budget Controller",
            is_active=True,
        ).values_list("user_id", flat=True)
    )


def notify_budget_submitted(budget_request, *, actor_id: int | None) -> None:
    approver_id = budget_request.current_approver_id
    if not approver_id:
        return
    summary = _budget_summary(budget_request)
    create_notification(
        recipient_id=approver_id,
        actor_id=actor_id,
        category=NotificationCategory.APPROVAL,
        event_type=NotificationEventType.BUDGET_REVIEW_NEEDED,
        title=f"Budget needs your approval: {summary}",
        body="A budget request has been submitted and is waiting for your approval.",
        related_object_type="budget_request",
        related_object_id=str(budget_request.id),
        action_url=_action_url(budget_request),
        metadata=_base_metadata(budget_request, CHANGE_SUBMITTED),
    )


def notify_budget_forwarded(
    budget_request,
    *,
    actor_id: int | None,
    next_approver_id: int,
) -> None:
    summary = _budget_summary(budget_request)
    create_notification(
        recipient_id=next_approver_id,
        actor_id=actor_id,
        category=NotificationCategory.APPROVAL,
        event_type=NotificationEventType.BUDGET_REVIEW_NEEDED,
        title=f"Budget needs your approval: {summary}",
        body="A budget request has been forwarded to you for approval.",
        related_object_type="budget_request",
        related_object_id=str(budget_request.id),
        action_url=_action_url(budget_request),
        metadata=_base_metadata(budget_request, CHANGE_FORWARDED),
    )


def notify_budget_approved(
    budget_request,
    *,
    actor_id: int | None,
    comment: str = "",
) -> None:
    recipient_id = budget_request.requested_by_id
    if not recipient_id:
        return
    summary = _budget_summary(budget_request)
    create_notification(
        recipient_id=recipient_id,
        actor_id=actor_id,
        category=NotificationCategory.APPROVAL,
        event_type=NotificationEventType.BUDGET_APPROVAL_RESULT,
        title=f"Budget approved: {summary}",
        body="Your budget request has been approved.",
        related_object_type="budget_request",
        related_object_id=str(budget_request.id),
        action_url=_action_url(budget_request),
        metadata=_base_metadata(
            budget_request,
            CHANGE_APPROVED,
            comment=comment or "",
        ),
    )


def notify_budget_rejected(
    budget_request,
    *,
    actor_id: int | None,
    comment: str = "",
) -> None:
    recipient_id = budget_request.requested_by_id
    if not recipient_id:
        return
    summary = _budget_summary(budget_request)
    create_notification(
        recipient_id=recipient_id,
        actor_id=actor_id,
        category=NotificationCategory.APPROVAL,
        event_type=NotificationEventType.BUDGET_APPROVAL_RESULT,
        title=f"Budget rejected: {summary}",
        body="Your budget request has been rejected.",
        related_object_type="budget_request",
        related_object_id=str(budget_request.id),
        action_url=_action_url(budget_request),
        metadata=_base_metadata(
            budget_request,
            CHANGE_REJECTED,
            comment=comment or "",
        ),
    )


def notify_budget_locked(budget_request, *, actor_id: int | None) -> None:
    recipient_id = budget_request.requested_by_id
    if not recipient_id:
        return
    summary = _budget_summary(budget_request)
    pool = budget_request.budget_pool
    create_notification(
        recipient_id=recipient_id,
        actor_id=actor_id,
        category=NotificationCategory.APPROVAL,
        event_type=NotificationEventType.BUDGET_APPROVAL_RESULT,
        title=f"Budget locked: {summary}",
        body="Your budget request has been locked and the amount deducted from the pool.",
        related_object_type="budget_request",
        related_object_id=str(budget_request.id),
        action_url=_action_url(budget_request),
        metadata=_base_metadata(
            budget_request,
            CHANGE_LOCKED,
            pool_used_amount=str(pool.used_amount) if pool else None,
            pool_available_amount=str(pool.available_amount) if pool else None,
        ),
    )


def notify_budget_pool_insufficient(budget_request, *, actor_id: int | None) -> None:
    summary = _budget_summary(budget_request)
    pool = budget_request.budget_pool
    project_id = pool.project_id if pool else None
    meta = _base_metadata(
        budget_request,
        CHANGE_POOL_INSUFFICIENT,
        requested_amount=str(budget_request.amount),
        pool_available_amount=str(pool.available_amount) if pool else None,
    )

    recipient_ids: set[int] = set()
    if budget_request.requested_by_id:
        recipient_ids.add(budget_request.requested_by_id)
    recipient_ids.update(_budget_controller_ids(project_id))

    create_notifications_for_users(
        recipient_ids=recipient_ids,
        actor_id=actor_id,
        category=NotificationCategory.APPROVAL,
        event_type=NotificationEventType.BUDGET_POOL_LOW,
        title=f"Insufficient budget pool: {summary}",
        body="The budget pool does not have enough available funds to lock this request.",
        related_object_type="budget_request",
        related_object_id=str(budget_request.id),
        action_url=_action_url(budget_request),
        metadata=meta,
    )


def notify_budget_cancelled(budget_request, *, actor_id: int | None) -> None:
    summary = _budget_summary(budget_request)
    meta = _base_metadata(budget_request, CHANGE_CANCELLED)
    title = f"Budget cancelled: {summary}"
    body = "This budget request has been cancelled."

    recipient_ids: set[int] = set()
    if budget_request.current_approver_id:
        recipient_ids.add(budget_request.current_approver_id)
    if budget_request.requested_by_id:
        recipient_ids.add(budget_request.requested_by_id)

    create_notifications_for_users(
        recipient_ids=recipient_ids,
        actor_id=actor_id,
        category=NotificationCategory.APPROVAL,
        event_type=NotificationEventType.BUDGET_APPROVAL_RESULT,
        title=title,
        body=body,
        related_object_type="budget_request",
        related_object_id=str(budget_request.id),
        action_url=_action_url(budget_request),
        metadata=meta,
    )


def notify_budget_escalated(budget_request, *, recipient_ids: list[int]) -> None:
    if not recipient_ids:
        return
    summary = _budget_summary(budget_request)
    create_notifications_for_users(
        recipient_ids=recipient_ids,
        actor_id=None,
        category=NotificationCategory.APPROVAL,
        event_type=NotificationEventType.BUDGET_ESCALATION,
        title=f"Budget escalation: {summary}",
        body=(
            f"This budget request ({budget_request.amount} {budget_request.currency}) "
            "has been escalated due to exceeding the threshold limit."
        ),
        related_object_type="budget_request",
        related_object_id=str(budget_request.id),
        action_url=_action_url(budget_request),
        metadata=_base_metadata(
            budget_request,
            CHANGE_ESCALATED,
            escalated_amount=str(budget_request.amount),
        ),
    )
