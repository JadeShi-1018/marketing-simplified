"""Shared Fernet encryption for secret fields (OAuth tokens, API keys, etc.).

Format stored in the database:  ``{key_id}:{fernet_ciphertext}``
Example:                         ``v1:gAAAAABh...``

Key rotation
------------
FIELD_ENCRYPTION_KEYS is a comma-separated list of ``key_id:fernet_key`` pairs.
The *first* entry is the active key used for new encryptions.  All entries are
tried when decrypting, so old ciphertext remains readable during a rotation.

To rotate:
1. Generate a new Fernet key:  python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
2. Prepend ``new_id:new_key,`` to FIELD_ENCRYPTION_KEYS in the environment.
3. Deploy.  New writes use the new key; old rows are still readable.
4. Run the ``reencrypt_secret_fields`` Celery task to migrate old rows.
5. Once all rows are migrated, remove old key entries from FIELD_ENCRYPTION_KEYS.

Backward compatibility
----------------------
Ciphertext without a ``key_id:`` prefix was written by the old per-app
crypto helpers (derived from SECRET_KEY).  ``decrypt_token`` falls back to
the legacy derivation automatically so existing rows keep working after
migration to this module.

Error handling
--------------
- ``encrypt_token(None)`` / ``decrypt_token(None)`` → returns ``None`` (normal
  business state: token not yet stored or cleared).
- Decryption of a non-empty ciphertext that cannot be unlocked with any
  available key raises ``DecryptionError``.  Callers should catch this,
  log it, and surface a "reconnect required" prompt to the user rather than
  silently passing ``None`` to downstream API clients.
"""

from __future__ import annotations

import base64
import logging
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings

logger = logging.getLogger(__name__)

_SEPARATOR = ":"
# Fernet tokens always start with "gA" (base64 of version byte 0x80).
# Used to distinguish legacy bare ciphertext from the new "key_id:cipher" format.
_FERNET_PREFIX = "gA"


class DecryptionError(Exception):
    """Raised when a non-empty ciphertext cannot be decrypted with any available key.

    This indicates a hard failure such as a misconfigured key, a deleted key,
    or tampered data — not a normal "token absent" condition.  Callers should
    catch this explicitly and handle it (e.g. mark the connection as needing
    re-authorization) rather than letting it propagate silently.
    """


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def encrypt_token(token: Optional[str]) -> Optional[str]:
    """Encrypt *token* with the active key and return ``key_id:ciphertext``.

    Returns ``None`` when *token* is ``None`` or empty so callers can store
    ``NULL`` / empty string without change.
    """
    if not token:
        return None

    keys = _parse_keys()
    if not keys:
        # Graceful degradation: fall back to legacy derivation if not configured.
        logger.warning(
            "FIELD_ENCRYPTION_KEYS is not configured; falling back to legacy key derivation."
        )
        return _legacy_fernet().encrypt(token.encode()).decode()

    active_key_id, active_fernet = keys[0]
    ciphertext = active_fernet.encrypt(token.encode()).decode()
    return f"{active_key_id}{_SEPARATOR}{ciphertext}"


def decrypt_token(encrypted: Optional[str]) -> Optional[str]:
    """Decrypt a token produced by :func:`encrypt_token`.

    Handles three input cases:

    - ``None`` / empty string → returns ``None`` (token not stored).
    - New format ``key_id:gAAAAAB...`` → look up key by key_id and decrypt.
    - Legacy format ``gAAAAAB...`` → try legacy derivation then all configured keys.

    Raises:
        DecryptionError: If *encrypted* is non-empty but cannot be decrypted
            with any available key.  Callers should catch this and treat the
            connection as requiring re-authorization.
    """
    if not encrypted:
        return None

    if not encrypted.startswith(_FERNET_PREFIX):
        sep_index = encrypted.find(_SEPARATOR)
        if sep_index != -1:
            key_id = encrypted[:sep_index]
            ciphertext = encrypted[sep_index + 1:]
            return _decrypt_with_key_id(key_id, ciphertext)

    return _decrypt_legacy(encrypted)


def needs_rotation(encrypted: Optional[str]) -> bool:
    """Return ``True`` if *encrypted* was written with a non-active key.

    Used by the re-encryption Celery task to identify rows that need updating.
    Returns ``False`` for empty / ``None`` values.
    """
    if not encrypted:
        return False

    keys = _parse_keys()
    if not keys:
        return False

    active_key_id = keys[0][0]

    if encrypted.startswith(_FERNET_PREFIX):
        return True  # Legacy format — always needs rotation.

    sep_index = encrypted.find(_SEPARATOR)
    if sep_index == -1:
        return True

    current_key_id = encrypted[:sep_index]
    return current_key_id != active_key_id


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _parse_keys() -> list[tuple[str, Fernet]]:
    """Return [(key_id, Fernet), ...] from FIELD_ENCRYPTION_KEYS setting.

    Each entry in the setting is ``key_id:fernet_base64_key``.
    The first entry is the active (write) key.
    """
    raw: str = getattr(settings, "FIELD_ENCRYPTION_KEYS", "")
    if not raw or not raw.strip():
        return []

    entries: list[tuple[str, Fernet]] = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            key_id, fernet_key = part.split(_SEPARATOR, 1)
        except ValueError:
            logger.warning(
                "FIELD_ENCRYPTION_KEYS entry %r has no key_id prefix — skipped.", part
            )
            continue
        try:
            entries.append((key_id.strip(), Fernet(fernet_key.strip().encode())))
        except Exception:
            logger.exception(
                "Invalid Fernet key for key_id %r in FIELD_ENCRYPTION_KEYS.", key_id
            )
    return entries


def _legacy_fernet() -> Fernet:
    """Reproduce the key derivation used by the old per-app crypto helpers."""
    key = base64.urlsafe_b64encode(
        settings.SECRET_KEY[:32].encode().ljust(32, b"=")
    )
    return Fernet(key)


def _decrypt_with_key_id(key_id: str, ciphertext: str) -> str:
    keys = _parse_keys()
    for kid, fernet in keys:
        if kid == key_id:
            try:
                return fernet.decrypt(ciphertext.encode()).decode()
            except InvalidToken:
                raise DecryptionError(
                    f"Ciphertext with key_id {key_id!r} could not be decrypted. "
                    "The key may have been rotated or the data is corrupted."
                )

    # key_id not in current key list — try all keys as last resort before failing.
    logger.warning(
        "key_id %r not found in FIELD_ENCRYPTION_KEYS; trying all keys.", key_id
    )
    result = _try_all_keys(ciphertext, keys)
    if result is None:
        raise DecryptionError(
            f"key_id {key_id!r} is not in FIELD_ENCRYPTION_KEYS and no fallback key succeeded."
        )
    return result


def _decrypt_legacy(ciphertext: str) -> str:
    """Try the legacy SECRET_KEY derivation, then fall back to all configured keys."""
    try:
        return _legacy_fernet().decrypt(ciphertext.encode()).decode()
    except InvalidToken:
        pass

    keys = _parse_keys()
    result = _try_all_keys(ciphertext, keys)
    if result is None:
        raise DecryptionError(
            "Legacy ciphertext could not be decrypted with the legacy key or any configured key. "
            "The SECRET_KEY may have changed or the data is corrupted."
        )
    return result


def _try_all_keys(
    ciphertext: str, keys: list[tuple[str, Fernet]]
) -> Optional[str]:
    """Try every key in *keys*; return plaintext or ``None`` if all fail."""
    for _, fernet in keys:
        try:
            return fernet.decrypt(ciphertext.encode()).decode()
        except InvalidToken:
            continue
    return None
