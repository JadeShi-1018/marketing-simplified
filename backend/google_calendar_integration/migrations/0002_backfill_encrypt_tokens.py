"""Data migration: re-encrypt GoogleCalendarConnection tokens."""

import base64
import logging

from cryptography.fernet import Fernet, InvalidToken
from django.db import migrations

logger = logging.getLogger(__name__)


def _active_fernet_and_key_id(settings):
    raw = getattr(settings, "FIELD_ENCRYPTION_KEYS", "")
    first_entry = raw.split(",")[0].strip()
    key_id, _, fernet_key = first_entry.partition(":")
    return key_id.strip(), Fernet(fernet_key.strip().encode())


def _legacy_fernet(settings):
    key = base64.urlsafe_b64encode(
        settings.SECRET_KEY[:32].encode().ljust(32, b"=")
    )
    return Fernet(key)


def _reencrypt(value, active_key_id, active_fernet, legacy_fernet):
    if not value:
        return value
    if value.startswith(f"{active_key_id}:"):
        return value
    if value.startswith("gA"):
        try:
            plaintext = legacy_fernet.decrypt(value.encode()).decode()
            return f"{active_key_id}:{active_fernet.encrypt(plaintext.encode()).decode()}"
        except InvalidToken:
            logger.warning("Could not decrypt legacy token — leaving unchanged.")
            return value
    return f"{active_key_id}:{active_fernet.encrypt(value.encode()).decode()}"


def forwards(apps, schema_editor):
    from django.conf import settings as django_settings

    active_key_id, active_fernet = _active_fernet_and_key_id(django_settings)
    legacy = _legacy_fernet(django_settings)

    GoogleCalendarConnection = apps.get_model("google_calendar_integration", "GoogleCalendarConnection")

    updated = 0
    for conn in GoogleCalendarConnection.objects.all():
        changed = False
        for field in ("encrypted_access_token", "encrypted_refresh_token"):
            old = getattr(conn, field) or ""
            new = _reencrypt(old, active_key_id, active_fernet, legacy)
            if new != old:
                setattr(conn, field, new)
                changed = True
        if changed:
            conn.save(update_fields=["encrypted_access_token", "encrypted_refresh_token"])
            updated += 1

    logger.info("google_calendar_integration backfill: %d rows re-encrypted.", updated)


def backwards(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("google_calendar_integration", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
