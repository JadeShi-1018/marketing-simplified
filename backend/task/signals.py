import logging
import threading
from django.db.models.signals import pre_save, post_save, post_delete
from django.dispatch import receiver
from .models import Task, TaskAttachment, TaskFieldHistory, TaskHierarchy
from .tasks import scan_task_attachment

logger = logging.getLogger(__name__)

_current_user = threading.local()


def set_current_user(user):
    _current_user.value = user


def get_current_user():
    return getattr(_current_user, 'value', None)


def _owner_display(user_obj):
    """Return a human-readable label for a user, or None."""
    if user_obj is None:
        return None
    return user_obj.get_full_name() or user_obj.username or user_obj.email or str(user_obj.pk)


def _field_value(old_instance, new_instance, field):
    """
    Return (old_str, new_str) for a tracked field.
    Uses the DB-fetched old_instance and the pre-save new_instance.
    FK fields are resolved to display strings here, not raw IDs.
    """
    if field == 'owner':
        # Use select_related-fetched owner on old; on instance use owner_id to
        # look up the new user without relying on the potentially stale FK cache.
        from django.contrib.auth import get_user_model
        User = get_user_model()

        old_val = _owner_display(old_instance.owner)

        new_owner_id = new_instance.__dict__.get('owner_id')  # read raw attname, no descriptor
        if new_owner_id is None:
            new_val = None
        elif old_instance.owner_id == new_owner_id:
            new_val = old_val  # unchanged — skip DB query
        else:
            try:
                new_val = _owner_display(User.objects.get(pk=new_owner_id))
            except User.DoesNotExist:
                new_val = str(new_owner_id)

        return old_val, new_val

    # Plain scalar field
    old_raw = getattr(old_instance, field, None)
    new_raw = new_instance.__dict__.get(field, getattr(new_instance, field, None))
    old_val = str(old_raw) if old_raw is not None else None
    new_val = str(new_raw) if new_raw is not None else None
    return old_val, new_val


@receiver(pre_save, sender=Task)
def record_task_field_changes(sender, instance, **kwargs):
    if not instance.pk:
        return
    try:
        old = Task.objects.select_related('owner').get(pk=instance.pk)
    except Task.DoesNotExist:
        return

    user = get_current_user()
    records = []
    try:
        for field in TaskFieldHistory.TRACKED_FIELDS:
            old_val, new_val = _field_value(old, instance, field)
            if old_val != new_val:
                records.append(TaskFieldHistory(
                    task=instance,
                    field_name=field,
                    old_value=old_val,
                    new_value=new_val,
                    changed_by=user,
                ))
        if records:
            TaskFieldHistory.objects.bulk_create(records)
    except Exception:
        logger.exception('TaskFieldHistory: failed to record field changes for task %s', instance.pk)


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
    
    if not remaining_parents.exists() and child_task.is_subtask:
        # No remaining parents and still marked as subtask → parent was cascade-deleted;
        # delete the now-orphaned subtask.  If is_subtask is already False the unlink
        # view cleared it intentionally, so we leave the task alone.
        child_task.delete()

