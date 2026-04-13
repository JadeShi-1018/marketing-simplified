from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver

from .models import Task, TaskAttachment, TaskHierarchy
from .tasks import scan_task_attachment

_task_status_cache: dict[int, str] = {}


@receiver(pre_save, sender=Task)
def _cache_previous_task_status(sender, instance, **kwargs):
    if not instance.pk:
        return
    try:
        prev = Task.objects.get(pk=instance.pk)
        _task_status_cache[instance.pk] = prev.status
    except Task.DoesNotExist:
        _task_status_cache[instance.pk] = None


@receiver(post_save, sender=Task)
def notify_task_owner_on_status_change(sender, instance, created, **kwargs):
    if created:
        return
    if getattr(instance, '_suppress_status_notification', False):
        _task_status_cache.pop(instance.pk, None)
        return
    old = _task_status_cache.pop(instance.pk, None)
    if old is None or old == instance.status or not instance.owner_id:
        return
    from notifications.models import NotificationCategory, NotificationEventType
    from notifications.services import create_notification

    create_notification(
        recipient_id=instance.owner_id,
        actor_id=None,
        category=NotificationCategory.TASKS,
        event_type=NotificationEventType.TASK_STATUS_CHANGED,
        title=f"Task status updated: {instance.summary}",
        body=f"Status changed from {old} to {instance.status}.",
        related_object_type="task",
        related_object_id=str(instance.id),
        action_url=f"/projects/{instance.project_id}/tasks/{instance.id}",
        metadata={
            "task_id": instance.id,
            "project_id": instance.project_id,
            "change_type": "task_status",
            "old_value": old,
            "new_value": instance.status,
            # Legacy keys kept for backward-compat with existing notifications.
            "old_status": old,
            "new_status": instance.status,
        },
    )


@receiver(post_save, sender=TaskAttachment)
def trigger_virus_scan(sender, instance, created, **kwargs):
    """
    Trigger virus scan when a new task attachment is uploaded
    """
    if created and instance.scan_status == TaskAttachment.PENDING:
        # Trigger virus scan asynchronously
        scan_task_attachment.delay(instance.id)


@receiver(post_delete, sender=TaskHierarchy)
def handle_subtask_orphan_check(sender, instance, **kwargs):
    """
    When a TaskHierarchy record is deleted, check if the child_task
    has any remaining parent tasks. If not, delete the orphaned subtask.
    
    This handles the case when a parent task is deleted (CASCADE deletes
    the TaskHierarchy record). When all parent tasks are deleted, the
    orphaned subtask is automatically deleted.
    """
    # Get child_task_id before instance is fully deleted
    child_task_id = instance.child_task_id
    
    # Check if child_task still exists and has any other parent_task relationships
    # Note: instance.child_task may not be accessible if child_task was deleted
    from .models import Task
    try:
        child_task = Task.objects.get(id=child_task_id)
    except Task.DoesNotExist:
        # Child task was already deleted, nothing to do
        return
    
    # Check if child_task has any other parent_task relationships
    remaining_parents = TaskHierarchy.objects.filter(
        child_task=child_task
    )
    
    if not remaining_parents.exists():
        # No remaining parents, delete the orphaned subtask
        child_task.delete()

