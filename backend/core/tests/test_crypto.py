"""Tests for core.crypto — Fernet encryption with key rotation.

Covers the main acceptance criteria from MED-331:
- encrypt / decrypt round-trip
- None passthrough
- DecryptionError on bad ciphertext
- Multi-key rotation: old key still decryptable after adding a new active key
- Backward-compat: legacy ciphertext (no key-id prefix) still decryptable
- needs_rotation helper
"""

from unittest.mock import patch

from cryptography.fernet import Fernet
from django.test import TestCase, override_settings

from core.crypto import DecryptionError, decrypt_token, encrypt_token, needs_rotation


def _make_key(key_id: str) -> str:
    """Return a 'key_id:fernet_key' string with a freshly generated key."""
    return f"{key_id}:{Fernet.generate_key().decode()}"


class EncryptDecryptRoundTripTest(TestCase):
    def setUp(self):
        self.key_setting = _make_key("v1")

    def test_roundtrip(self):
        with override_settings(FIELD_ENCRYPTION_KEYS=self.key_setting):
            ct = encrypt_token("my-secret-token")
            self.assertEqual(decrypt_token(ct), "my-secret-token")

    def test_none_passthrough_encrypt(self):
        with override_settings(FIELD_ENCRYPTION_KEYS=self.key_setting):
            self.assertIsNone(encrypt_token(None))

    def test_none_passthrough_decrypt(self):
        with override_settings(FIELD_ENCRYPTION_KEYS=self.key_setting):
            self.assertIsNone(decrypt_token(None))

    def test_empty_string_passthrough_decrypt(self):
        with override_settings(FIELD_ENCRYPTION_KEYS=self.key_setting):
            self.assertIsNone(decrypt_token(""))

    def test_ciphertext_starts_with_key_id(self):
        with override_settings(FIELD_ENCRYPTION_KEYS=self.key_setting):
            ct = encrypt_token("token")
            self.assertTrue(ct.startswith("v1:"), f"Expected 'v1:' prefix, got: {ct[:10]}")

    def test_different_plaintexts_produce_different_ciphertexts(self):
        with override_settings(FIELD_ENCRYPTION_KEYS=self.key_setting):
            ct1 = encrypt_token("token-a")
            ct2 = encrypt_token("token-b")
            self.assertNotEqual(ct1, ct2)

    def test_same_plaintext_produces_different_ciphertexts(self):
        """Fernet uses random IV — same input should never produce the same output."""
        with override_settings(FIELD_ENCRYPTION_KEYS=self.key_setting):
            ct1 = encrypt_token("same-token")
            ct2 = encrypt_token("same-token")
            self.assertNotEqual(ct1, ct2)


class DecryptionErrorTest(TestCase):
    def setUp(self):
        self.key_setting = _make_key("v1")

    def test_corrupted_ciphertext_raises(self):
        with override_settings(FIELD_ENCRYPTION_KEYS=self.key_setting):
            with self.assertRaises(DecryptionError):
                decrypt_token("v1:not-valid-fernet-data")

    def test_unknown_key_id_raises(self):
        with override_settings(FIELD_ENCRYPTION_KEYS=self.key_setting):
            other_key = _make_key("v99")
            with override_settings(FIELD_ENCRYPTION_KEYS=other_key):
                ct = encrypt_token("secret")
            with override_settings(FIELD_ENCRYPTION_KEYS=self.key_setting):
                with self.assertRaises(DecryptionError):
                    decrypt_token(ct)

    def test_completely_random_string_raises(self):
        with override_settings(FIELD_ENCRYPTION_KEYS=self.key_setting):
            with self.assertRaises(DecryptionError):
                decrypt_token("garbage-data-no-prefix")


class KeyRotationTest(TestCase):
    """Verify old ciphertext remains readable after a new key is added."""

    def test_old_ciphertext_still_decryptable_after_rotation(self):
        old_key = _make_key("v1")
        new_key = _make_key("v2")

        with override_settings(FIELD_ENCRYPTION_KEYS=old_key):
            ct_old = encrypt_token("original-secret")

        # After rotation: new key is first (active), old key is second (fallback)
        rotated_keys = f"{new_key},{old_key}"
        with override_settings(FIELD_ENCRYPTION_KEYS=rotated_keys):
            self.assertEqual(decrypt_token(ct_old), "original-secret")

    def test_new_encrypt_uses_first_key_after_rotation(self):
        old_key = _make_key("v1")
        new_key = _make_key("v2")
        rotated_keys = f"{new_key},{old_key}"

        with override_settings(FIELD_ENCRYPTION_KEYS=rotated_keys):
            ct_new = encrypt_token("new-secret")
            self.assertTrue(ct_new.startswith("v2:"), f"Expected 'v2:' prefix, got: {ct_new[:10]}")
            self.assertEqual(decrypt_token(ct_new), "new-secret")

    def test_both_old_and_new_ciphertexts_work_with_both_keys(self):
        old_key = _make_key("v1")
        new_key = _make_key("v2")
        rotated_keys = f"{new_key},{old_key}"

        with override_settings(FIELD_ENCRYPTION_KEYS=old_key):
            ct_v1 = encrypt_token("token-v1")

        with override_settings(FIELD_ENCRYPTION_KEYS=rotated_keys):
            ct_v2 = encrypt_token("token-v2")
            self.assertEqual(decrypt_token(ct_v1), "token-v1")
            self.assertEqual(decrypt_token(ct_v2), "token-v2")


class LegacyBackwardCompatTest(TestCase):
    """Ciphertext written by old per-app helpers (no key-id prefix) must still decrypt."""

    def _make_legacy_ciphertext(self, token: str) -> str:
        """Reproduce the old per-app derivation: SECRET_KEY[:32] padded to 32 bytes."""
        import base64
        from django.conf import settings
        from cryptography.fernet import Fernet

        key = base64.urlsafe_b64encode(
            settings.SECRET_KEY[:32].encode().ljust(32, b"=")
        )
        return Fernet(key).encrypt(token.encode()).decode()

    def test_legacy_ciphertext_decryptable(self):
        legacy_ct = self._make_legacy_ciphertext("legacy-secret")
        result = decrypt_token(legacy_ct)
        self.assertEqual(result, "legacy-secret")

    def test_legacy_ciphertext_has_no_key_id_prefix(self):
        legacy_ct = self._make_legacy_ciphertext("x")
        self.assertTrue(legacy_ct.startswith("gA"), f"Expected raw Fernet output, got: {legacy_ct[:5]}")


class NeedsRotationTest(TestCase):
    def setUp(self):
        self.key_setting = _make_key("v1")

    def test_current_key_does_not_need_rotation(self):
        with override_settings(FIELD_ENCRYPTION_KEYS=self.key_setting):
            ct = encrypt_token("token")
            self.assertFalse(needs_rotation(ct))

    def test_old_key_needs_rotation(self):
        old_key = _make_key("v1")
        new_key = _make_key("v2")

        with override_settings(FIELD_ENCRYPTION_KEYS=old_key):
            ct = encrypt_token("token")

        rotated_keys = f"{new_key},{old_key}"
        with override_settings(FIELD_ENCRYPTION_KEYS=rotated_keys):
            self.assertTrue(needs_rotation(ct))

    def test_none_does_not_need_rotation(self):
        with override_settings(FIELD_ENCRYPTION_KEYS=self.key_setting):
            self.assertFalse(needs_rotation(None))
