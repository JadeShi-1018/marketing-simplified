"""Re-exports from the shared core.crypto module.

All encryption logic now lives in core.crypto.  This module is kept so that
existing imports (e.g. `from .crypto import encrypt_token`) continue to work
without change.
"""

from core.crypto import DecryptionError, decrypt_token, encrypt_token, needs_rotation  # noqa: F401
