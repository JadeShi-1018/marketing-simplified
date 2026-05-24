from django.db import models
from django.conf import settings
from django.utils import timezone
from datetime import timedelta
from core.models import TimeStampedModel, Project, Team


class Queue(TimeStampedModel):
    TIER_CHOICES = [
        ('T1', 'T1 Frontline'),
        ('T2', 'T2 Technical Support'),
        ('T3', 'T3 Escalations'),
        ('T4', 'T4 VIP'),
    ]

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='queues')
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    tier = models.CharField(max_length=4, choices=TIER_CHOICES, default='T1')
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ('project', 'name')
        ordering = ['display_order', 'name']

    def __str__(self):
        return f"{self.name} ({self.get_tier_display()})"


class QueueAgent(TimeStampedModel):
    queue = models.ForeignKey(Queue, on_delete=models.CASCADE, related_name='agents')
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='queue_assignments'
    )
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='queue_agent_assignments'
    )

    class Meta:
        unique_together = ('queue', 'user')

    def __str__(self):
        return f"{self.user} - {self.queue.name}"


class QueueTeam(TimeStampedModel):
    queue = models.ForeignKey(Queue, on_delete=models.CASCADE, related_name='teams')
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name='queue_assignments')

    class Meta:
        unique_together = ('queue', 'team')

    def __str__(self):
        return f"{self.team.name} - {self.queue.name}"


class CSMInvitation(TimeStampedModel):
    email = models.EmailField()
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='csm_invitations')
    team = models.ForeignKey(
        Team, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='csm_invitations'
    )
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, related_name='csm_invitations_sent'
    )
    token = models.CharField(max_length=64, unique=True, db_index=True)
    expires_at = models.DateTimeField()
    accepted = models.BooleanField(default=False)
    accepted_at = models.DateTimeField(null=True, blank=True)

    def is_expired(self):
        return timezone.now() > self.expires_at

    def __str__(self):
        return f"Invitation to {self.email} ({'accepted' if self.accepted else 'pending'})"
