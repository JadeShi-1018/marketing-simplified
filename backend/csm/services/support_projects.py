"""Support project CRUD for CSM-S01-08."""

from django.core.exceptions import ValidationError
from django.db import transaction
from csm.models import Queue, SupportProject, Ticket, TicketFormAssignment


def _normalize_name(name):
    return (name or '').strip()


def _validate_name(name):
    if not name:
        raise ValidationError({'name': 'Name is required.'})
    if len(name) > 200:
        raise ValidationError({'name': 'Name must be 200 characters or fewer.'})


def _assert_unique_name(project_id, name, exclude_id=None):
    qs = SupportProject.objects.filter(project_id=project_id, name__iexact=name)
    if exclude_id is not None:
        qs = qs.exclude(pk=exclude_id)
    if qs.exists():
        raise ValidationError({
            'name': 'A support project with this name already exists.',
        })


def _validate_default_queue(project_id, queue_id):
    if queue_id is None:
        return None

    queue = Queue.objects.filter(pk=queue_id).first()
    if not queue or queue.project_id != project_id or not queue.is_active:
        raise ValidationError({
            'default_queue': 'Queue must belong to this workspace and be active.',
        })
    return queue


def list_support_projects_for_workspace(project_id, *, include_archived=False):
    """List support projects for admin API (optionally includes archived)."""
    qs = SupportProject.objects.filter(project_id=project_id).select_related('default_queue')
    if not include_archived:
        qs = qs.filter(is_archived=False)
    return qs.order_by('name')


@transaction.atomic
def create_support_project(project_id, *, name, default_queue_id=None):
    name = _normalize_name(name)
    _validate_name(name)
    _assert_unique_name(project_id, name)
    default_queue = _validate_default_queue(project_id, default_queue_id)
    return SupportProject.objects.create(
        project_id=project_id,
        name=name,
        default_queue=default_queue,
    )


@transaction.atomic
def update_support_project(support_project, *, name=None, default_queue_id=..., is_archived=None):
    if name is not None:
        name = _normalize_name(name)
        _validate_name(name)
        _assert_unique_name(support_project.project_id, name, exclude_id=support_project.pk)
        support_project.name = name

    if default_queue_id is not ...:
        support_project.default_queue = _validate_default_queue(
            support_project.project_id,
            default_queue_id,
        )

    if is_archived is not None:
        support_project.is_archived = is_archived

    support_project.save()
    return support_project


@transaction.atomic
def archive_support_project(support_project):
    if support_project.is_archived:
        return support_project
    support_project.is_archived = True
    support_project.save(update_fields=['is_archived', 'updated_at'])
    return support_project


def assert_can_hard_delete_support_project(support_project):
    if Ticket.objects.filter(support_project=support_project).exists():
        raise ValidationError({
            'detail': 'Cannot delete a support project referenced by tickets.',
        })
    if TicketFormAssignment.objects.filter(support_project=support_project).exists():
        raise ValidationError({
            'detail': 'Cannot delete a support project assigned to a ticket form.',
        })
