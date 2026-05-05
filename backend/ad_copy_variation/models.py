import uuid

from django.conf import settings
from django.db import models

from core.models import TimeStampedModel


class AdCopyVariation(TimeStampedModel):
    SOURCE_MODE_CHOICES = [
        ('existing', 'Existing creative'),
        ('custom', 'Custom content'),
        ('external_url', 'External URL'),
    ]

    creative = models.ForeignKey(
        'meta_ads.MetaAdCreative',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='copy_variations',
    )
    source_mode = models.CharField(max_length=32, choices=SOURCE_MODE_CHOICES)
    source_ref = models.TextField(blank=True, default='')

    hook = models.TextField(blank=True, default='')
    headline = models.TextField(blank=True, default='')
    description = models.TextField(blank=True, default='')
    cta = models.CharField(max_length=64, blank=True, default='')

    instruction = models.TextField(blank=True, default='')
    model_name = models.CharField(max_length=64, default='gemini-2.5-flash-lite')
    prompt_version = models.CharField(max_length=32, default='v1')

    batch_id = models.UUIDField(
        null=True,
        blank=True,
        db_index=True,
        help_text='Groups variations generated from the same batch call.',
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
    )

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'AdCopyVariation({self.source_mode}, creative={self.creative_id})'
