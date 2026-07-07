"""
Slug backfill helper for data migrations.

Designed to be called from RunPython with historical models
(apps.get_model), which lack the SluggedResourceModelMixin save()
override, so slug generation is replicated here.
"""
import uuid

from django.db.models import Q
from django.utils.text import slugify


def _generate_slug(model_label, source_value, used):
    base = slugify(str(source_value or ""))
    if not base:
        base = f"{model_label}-{str(uuid.uuid4())[:8]}"
    elif base.isdigit():
        # Slug-only lookups: never produce a purely numeric slug.
        base = f"{model_label}-{base}"
    base = base[:200]

    slug = base
    counter = 1
    while slug in used:
        slug = f"{base}-{counter}"
        counter += 1
    used.add(slug)
    return slug


from django.db.models import Q


def backfill_slugs(model, source_field=None):
    """
    Populate `slug` for all rows where it is NULL or empty string.

    `source_field` names the field to slugify; when None, a uuid-based
    fallback slug is generated (for models without a usable text field).
    """
    used = set(
        model.objects.exclude(Q(slug__isnull=True) | Q(slug='') | Q(slug__startswith='temp-empty-')).values_list('slug', flat=True)
    )
    model_label = model.__name__.lower()

    batch = []
    for obj in model.objects.filter(Q(slug__isnull=True) | Q(slug='') | Q(slug__startswith='temp-empty-')).iterator():
        value = getattr(obj, source_field, "") if source_field else ""
        obj.slug = _generate_slug(model_label, value, used)
        batch.append(obj)
        if len(batch) >= 500:
            model.objects.bulk_update(batch, ['slug'])
            batch = []
    if batch:
        model.objects.bulk_update(batch, ['slug'])
