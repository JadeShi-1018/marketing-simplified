import uuid

from django.db import models
from django.utils import timezone


class AuthenticationLockout(models.Model):
    class Scope(models.TextChoices):
        IP = 'ip', 'IP address'
        USERNAME = 'username', 'Username'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    scope = models.CharField(max_length=20, choices=Scope.choices)
    identifier = models.CharField(max_length=255, db_index=True)
    reason = models.CharField(max_length=255)
    failure_count = models.PositiveIntegerField(default=0)
    locked_until = models.DateTimeField(db_index=True)
    last_attempt_at = models.DateTimeField()
    resolved_at = models.DateTimeField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'authentication_lockouts'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['scope', 'identifier', 'locked_until']),
            models.Index(fields=['scope', 'identifier', 'resolved_at']),
        ]

    def __str__(self):
        return f'{self.get_scope_display()} {self.identifier} locked until {self.locked_until.isoformat()}'

    @property
    def is_active(self):
        return self.resolved_at is None and self.locked_until > timezone.now()

    @property
    def seconds_remaining(self):
        remaining = int((self.locked_until - timezone.now()).total_seconds())
        return max(0, remaining)
