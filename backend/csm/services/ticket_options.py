"""Support project / work type options and queue routing for ticket forms."""

from django.core.exceptions import ValidationError

from core.models import ProjectMember
from csm.models import CsmWorkType, Queue, SupportProject


def _member_display_name(user):
    full = ' '.join(filter(None, [user.first_name, user.last_name])).strip()
    return full or user.username or user.email or f'User {user.id}'


def list_project_members(project_id):
    """Active project members for people field preview dropdowns."""
    return (
        ProjectMember.objects.filter(project_id=project_id, is_active=True)
        .select_related('user')
        .order_by('user__first_name', 'user__last_name', 'user__email')
    )


def list_support_projects(project_id):
    """Active (non-archived) support projects for builder / preview dropdowns."""
    return SupportProject.objects.filter(
        project_id=project_id,
        is_archived=False,
    ).select_related('default_queue').order_by('name')


def list_work_types(project_id):
    """Active work types for builder / preview dropdowns."""
    return CsmWorkType.objects.filter(
        project_id=project_id,
        is_active=True,
    ).order_by('sort_order', 'name')


def get_form_options(project_id):
    """
    Shape used by Phase 4 GET .../request-form/ in the `options` key.
    """
    return {
        'support_projects': [
            {'id': row.id, 'name': row.name}
            for row in list_support_projects(project_id)
        ],
        'work_types': [
            {'id': row.id, 'name': row.name}
            for row in list_work_types(project_id)
        ],
        'project_members': [
            {
                'id': row.user_id,
                'name': _member_display_name(row.user),
                'email': row.user.email or '',
            }
            for row in list_project_members(project_id)
        ],
    }


def resolve_queue_for_submission(project_id, support_project_id=None, organisation_id=None):
    """
    Pick queue for a new ticket (§5.7 routing pseudocode).

    Order:
    1. support_project.default_queue (if active)
    2. first active Queue on project (optionally filtered by organisation_id)
    3. raise ValidationError
    """
    if support_project_id:
        sp = SupportProject.objects.filter(
            pk=support_project_id,
            project_id=project_id,
            is_archived=False,
        ).select_related('default_queue').first()
        if sp and sp.default_queue_id and sp.default_queue.is_active:
            return sp.default_queue

    qs = Queue.objects.filter(project_id=project_id, is_active=True)
    if organisation_id:
        qs = qs.filter(organisation_id=organisation_id)
    queue = qs.order_by('display_order', 'name').first()
    if queue:
        return queue

    raise ValidationError({
        'queue': 'No queue configured for this project. Add a queue in Customer Service settings.',
    })
