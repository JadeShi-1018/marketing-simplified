from django.conf import settings
from django.db import models

import logging

from .crypto import DecryptionError, decrypt_token, encrypt_token

logger = logging.getLogger(__name__)


class LinearCredential(models.Model):
    """Stores Linear OAuth access token (encrypted at rest)."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="linear_credential",
    )
    # DB column is legacy `organization_id` (varchar(64)), not a FK to core.Organization.
    linear_workspace_key = models.CharField(
        max_length=64,
        blank=True,
        default="",
        db_column="organization_id",
        help_text="Legacy varchar column; MediaJira org id as string and/or future Linear workspace id.",
    )
    organization_name = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Denormalized org name for display.",
    )
    default_team_id = models.CharField(max_length=64, blank=True, default="")
    sync_enabled = models.BooleanField(default=True)
    encrypted_access_token = models.TextField()
    token_expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def set_access_token(self, access_token: str | None) -> None:
        self.encrypted_access_token = encrypt_token(access_token) or ""

    def get_access_token(self) -> str | None:
        try:
            return decrypt_token(self.encrypted_access_token)
        except DecryptionError:
            logger.error(
                "LinearCredential(user=%s): access token decryption failed — reconnect required.",
                self.user_id,
            )
            return None

    def __str__(self) -> str:
        return f"LinearCredential for {self.user}"


class LinearTaskLink(models.Model):
    """Optional row linking a task to a Linear issue (sync / import metadata)."""

    task = models.ForeignKey(
        "task.Task",
        on_delete=models.CASCADE,
        related_name="linear_links",
    )
    linear_issue_id = models.CharField(max_length=64, blank=True, default="")

    class Meta:
        db_table = "linear_integration_lineartasklink"

    def __str__(self) -> str:
        return f"LinearTaskLink task={self.task_id} issue={self.linear_issue_id!r}"
