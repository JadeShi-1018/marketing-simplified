"""
Django signal handlers for agent workflow triggers.
"""

import logging
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import ImportedCSVFile

logger = logging.getLogger(__name__)


@receiver(post_save, sender=ImportedCSVFile)
def trigger_workflows_on_data_upload(sender, instance, created, **kwargs):
    """
    Trigger instant workflows when a spreadsheet is uploaded.
    """
    if not created:
        return

    try:
        from .trigger_handlers import InstantHandler

        InstantHandler.handle_internal_event(
            event_type='spreadsheet.uploaded',
            event_data={
                'file_id': str(instance.id),
                'filename': instance.original_filename,
                'project_id': instance.project_id if instance.project_id else None,
                'row_count': getattr(instance, 'row_count', 0),
            }
        )
        logger.info(f"Triggered instant workflows for spreadsheet upload: {instance.id}")
    except Exception:
        logger.exception(f"Error triggering workflows for spreadsheet {instance.id}")
