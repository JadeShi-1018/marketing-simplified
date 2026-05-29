"""
chat/signals.py
───────────────
Keeps Message.search_vector in sync whenever a message is saved.

The vector weights:
  A (highest) — message content (plain text)
  B           — sender username / email

NOTE: We use Value(instance.sender.username) instead of the relation
path 'sender__username' because QuerySet.update() cannot traverse
ForeignKey joins; passing a literal Value avoids the restriction.
"""

from django.db.models import Value
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.contrib.postgres.search import SearchVector


@receiver(post_save, sender='chat.Message')
def update_message_search_vector(sender, instance, **kwargs):
    """Rebuild the tsvector for this message after every save.

    Revoked or soft-deleted messages get search_vector=NULL so they are
    never surfaced by FTS *or* the icontains fallback (which matches on
    content; nulling out the vector is belt-and-suspenders on top of the
    is_revoked=False / is_deleted=False filters in the search view).
    """
    if instance.is_revoked or instance.is_deleted:
        # Remove from search index immediately — the content field still
        # holds the original text, so we must not leave a populated vector.
        sender.objects.filter(pk=instance.pk).update(search_vector=None)
        return

    # Resolve the sender username at Python level to avoid an FK traversal
    # in the UPDATE statement, which Django/PostgreSQL doesn't support cleanly.
    try:
        sender_name = instance.sender.username or instance.sender.email or ''
    except Exception:
        sender_name = ''

    sender.objects.filter(pk=instance.pk).update(
        search_vector=(
            SearchVector('content', weight='A', config='english')
            + SearchVector(Value(sender_name), weight='B', config='english')
        )
    )
