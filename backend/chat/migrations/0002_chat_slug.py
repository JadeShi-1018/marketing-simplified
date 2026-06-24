from django.db import migrations, models
from django.db.models import Q

from core.slug_backfill import backfill_slugs


def backfill_chat(apps, schema_editor):
    Chat = apps.get_model('chat', 'Chat')
    used = set(
        Chat.objects.exclude(slug__isnull=True)
        .exclude(slug='')
        .values_list('slug', flat=True)
    )
    import uuid
    from django.utils.text import slugify

    batch = []
    for obj in Chat.objects.filter(Q(slug__isnull=True) | Q(slug='')).iterator():
        if obj.type == 'group' and obj.name:
            source = obj.name
        else:
            source = ''
        base = slugify(str(source or ''))
        if not base:
            base = f"chat-{str(uuid.uuid4())[:8]}"
        elif base.isdigit():
            base = f"chat-{base}"
        base = base[:200]
        slug = base
        counter = 1
        while slug in used:
            slug = f"{base}-{counter}"
            counter += 1
        used.add(slug)
        obj.slug = slug
        batch.append(obj)
        if len(batch) >= 500:
            Chat.objects.bulk_update(batch, ['slug'])
            batch = []
    if batch:
        Chat.objects.bulk_update(batch, ['slug'])


class Migration(migrations.Migration):

    dependencies = [
        ('chat', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='chat',
            name='slug',
            field=models.SlugField(blank=True, max_length=255, null=True, unique=True),
        ),
        migrations.RunPython(backfill_chat, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='chat',
            name='slug',
            field=models.SlugField(blank=True, max_length=255, unique=True),
        ),
    ]
