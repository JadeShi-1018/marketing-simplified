"""Work type CRUD for CSM-S01-08."""

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Max

from csm.models import CsmWorkType


def _normalize_name(name):
    return (name or '').strip()


def _validate_name(name):
    if not name:
        raise ValidationError({'name': 'Name is required.'})
    if len(name) > 200:
        raise ValidationError({'name': 'Name must be 200 characters or fewer.'})


def _assert_unique_name(project_id, name, exclude_id=None):
    qs = CsmWorkType.objects.filter(project_id=project_id, name__iexact=name)
    if exclude_id is not None:
        qs = qs.exclude(pk=exclude_id)
    if qs.exists():
        raise ValidationError({
            'name': 'A work type with this name already exists.',
        })


def _next_sort_order(project_id):
    current = CsmWorkType.objects.filter(project_id=project_id).aggregate(
        m=Max('sort_order'),
    )['m']
    return 0 if current is None else current + 1


def _assert_can_deactivate(work_type):
    if not work_type.is_active:
        return
    active_count = CsmWorkType.objects.filter(
        project_id=work_type.project_id,
        is_active=True,
    ).count()
    if active_count <= 1:
        raise ValidationError({
            'is_active': 'At least one active work type is required.',
        })


def list_work_types_for_workspace(project_id, *, include_inactive=False):
    """List work types for admin API (optionally includes inactive)."""
    qs = CsmWorkType.objects.filter(project_id=project_id)
    if not include_inactive:
        qs = qs.filter(is_active=True)
    return qs.order_by('sort_order', 'name')


@transaction.atomic
def create_work_type(project_id, *, name, sort_order=None):
    name = _normalize_name(name)
    _validate_name(name)
    _assert_unique_name(project_id, name)
    if sort_order is None:
        sort_order = _next_sort_order(project_id)
    return CsmWorkType.objects.create(
        project_id=project_id,
        name=name,
        sort_order=sort_order,
    )


@transaction.atomic
def update_work_type(work_type, *, name=None, sort_order=None, is_active=None):
    if name is not None:
        name = _normalize_name(name)
        _validate_name(name)
        _assert_unique_name(work_type.project_id, name, exclude_id=work_type.pk)
        work_type.name = name

    if sort_order is not None:
        work_type.sort_order = sort_order

    if is_active is not None:
        if not is_active:
            _assert_can_deactivate(work_type)
        work_type.is_active = is_active

    work_type.save()
    return work_type


@transaction.atomic
def deactivate_work_type(work_type):
    _assert_can_deactivate(work_type)
    if work_type.is_active:
        work_type.is_active = False
        work_type.save(update_fields=['is_active', 'updated_at'])
    return work_type


@transaction.atomic
def reorder_work_types(project_id, ordered_ids):
    if not ordered_ids:
        raise ValidationError({'ids': 'At least one work type id is required.'})

    work_types = list(
        CsmWorkType.objects.filter(project_id=project_id, pk__in=ordered_ids),
    )
    found_ids = {wt.pk for wt in work_types}
    missing = [pk for pk in ordered_ids if pk not in found_ids]
    if missing:
        raise ValidationError({
            'ids': f'Work type ids not found in this workspace: {missing}',
        })

    by_id = {wt.pk: wt for wt in work_types}
    for index, pk in enumerate(ordered_ids):
        wt = by_id[pk]
        wt.sort_order = index

    CsmWorkType.objects.bulk_update(by_id.values(), ['sort_order', 'updated_at'])
    return list_work_types_for_workspace(project_id, include_inactive=True)
