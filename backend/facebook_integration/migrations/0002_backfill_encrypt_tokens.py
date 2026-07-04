"""Data migration: re-encrypt FacebookConnection.encrypted_access_token.

WHY THIS FILE EXISTS
--------------------
When this app was first built, tokens were either:
  (a) stored as plaintext, OR
  (b) encrypted with a weak per-app Fernet key derived from Django's SECRET_KEY.

Now that core.crypto uses proper, rotatable Fernet keys (FIELD_ENCRYPTION_KEYS),
every row in the database must be converted to the new format so that:
  - The active key in FIELD_ENCRYPTION_KEYS can read/write them.
  - Key rotation works correctly in the future.

HOW DJANGO MIGRATIONS WORK (for juniors)
-----------------------------------------
Django migrations are like a "change log" for your database.
Each .py file in the migrations/ folder represents one change.
Django runs them in order (0001, 0002, ...) and remembers which
ones have already been applied.

A "data migration" is special: it doesn't change the table *structure*
(no new columns, no type changes). Instead, it changes the *data* inside
the existing columns — in this case, re-encrypting token values.

We use RunPython, which lets us run arbitrary Python code during migration.
The code receives two "app registry" objects (apps, schema_editor) that let
us access models safely without importing them directly.
"""

import base64
import logging

from cryptography.fernet import Fernet, InvalidToken
from django.db import migrations

logger = logging.getLogger(__name__)

# ── helpers (self-contained so this migration never breaks if core.crypto changes) ──

def _active_fernet_and_key_id(settings):
    """
    Parse FIELD_ENCRYPTION_KEYS from settings and return (key_id, Fernet) for
    the *first* (= active) key.

    Example setting value:  "v1:gAAAAABh..."
    """
    raw = getattr(settings, "FIELD_ENCRYPTION_KEYS", "")
    first_entry = raw.split(",")[0].strip()   # take only the first key
    key_id, _, fernet_key = first_entry.partition(":")
    return key_id.strip(), Fernet(fernet_key.strip().encode())


def _legacy_fernet(settings):
    """
    Reproduce the OLD per-app derivation: SECRET_KEY[:32] padded to 32 bytes,
    then base64-encoded to satisfy Fernet's 32-byte URL-safe requirement.

    This is how the old crypto.py files encrypted tokens before MED-331.
    We need this to DECRYPT old rows so we can RE-ENCRYPT them with the new key.
    """
    key = base64.urlsafe_b64encode(
        settings.SECRET_KEY[:32].encode().ljust(32, b"=")
    )
    return Fernet(key)


def _reencrypt(value, active_key_id, active_fernet, legacy_fernet):
    """
    Convert a single token value to the new encryption format.

    Decision tree:
      1. Empty / None  → return as-is (no token stored yet, nothing to do)
      2. Already new format  ("v1:gA...")  → skip (already migrated)
      3. Legacy Fernet ciphertext  ("gA...")  → decrypt with legacy key, re-encrypt
      4. Anything else  → treat as plaintext, encrypt it
    """
    if not value:
        return value  # case 1: nothing to do

    # case 2: already in new format — key_id prefix present and it's the active key
    if value.startswith(f"{active_key_id}:"):
        return value

    # case 3: legacy Fernet — raw ciphertext produced by the old crypto helper
    if value.startswith("gA"):
        try:
            plaintext = legacy_fernet.decrypt(value.encode()).decode()
            return f"{active_key_id}:{active_fernet.encrypt(plaintext.encode()).decode()}"
        except InvalidToken:
            # Token looks like Fernet but we can't decrypt it (wrong key, corruption).
            # Leave it unchanged — the model's get_access_token() will log an error
            # and return None, prompting the user to reconnect.
            logger.warning("Could not decrypt legacy token — leaving unchanged.")
            return value

    # case 4: plaintext (never encrypted)
    return f"{active_key_id}:{active_fernet.encrypt(value.encode()).decode()}"


# ── the actual migration functions ──

def forwards(apps, schema_editor):
    """
    Called by Django when applying (running) this migration.
    Reads every FacebookConnection row and re-encrypts its token.
    """
    from django.conf import settings as django_settings

    active_key_id, active_fernet = _active_fernet_and_key_id(django_settings)
    legacy = _legacy_fernet(django_settings)

    # We use apps.get_model() instead of importing the model directly.
    # This gives us a "frozen" snapshot of the model as it was when this
    # migration was written — safe even if the model changes later.
    FacebookConnection = apps.get_model("facebook_integration", "FacebookConnection")

    updated = 0
    for conn in FacebookConnection.objects.all():
        new_val = _reencrypt(conn.encrypted_access_token or "", active_key_id, active_fernet, legacy)
        if new_val != conn.encrypted_access_token:
            conn.encrypted_access_token = new_val
            conn.save(update_fields=["encrypted_access_token"])
            updated += 1

    logger.info("facebook_integration backfill: %d rows re-encrypted.", updated)


def backwards(apps, schema_editor):
    """
    Called by Django when rolling back (reversing) this migration.
    We cannot safely reverse encryption (we'd need to decrypt and store plaintext),
    so this is intentionally a no-op.
    """
    pass  # irreversible by design


class Migration(migrations.Migration):

    dependencies = [
        # This migration must run AFTER the initial table was created.
        ("facebook_integration", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
