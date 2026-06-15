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

    project = models.ForeignKey(Project, on_delete=models.CASCADE, null=True, blank=True, related_name='queues')
    organisation = models.ForeignKey(
        'customer.CustomerOrganisation',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='queues',
    )
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    tier = models.CharField(max_length=4, choices=TIER_CHOICES, default='T1')
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ('organisation', 'name')
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


class CustomerUser(TimeStampedModel):
    USER_TYPE_CHOICES = [
        ('agent', 'Agent'),
        ('supervisor', 'Supervisor'),
        ('admin', 'Admin'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='customer_user_profiles',
    )
    team = models.ForeignKey(
        Team, on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='customer_users',
    )
    queue = models.ForeignKey(
        Queue, on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='customer_users',
    )
    organisation = models.ForeignKey(
        'customer.CustomerOrganisation',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='customer_users',
    )
    user_type = models.CharField(max_length=20, choices=USER_TYPE_CHOICES, default='agent')
    is_active = models.BooleanField(default=True)
    is_creator = models.BooleanField(default=False)

    class Meta:
        unique_together = ('user', 'queue')
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user.email} ({self.get_user_type_display()})"


class CsmNotification(TimeStampedModel):
    NOTIFICATION_TYPES = [
        ('org_invitation', 'Organisation Invitation'),
    ]
    ACTION_STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('accepted', 'Accepted'),
        ('declined', 'Declined'),
    ]

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='csm_notifications',
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, related_name='csm_notifications_sent',
    )
    notification_type = models.CharField(max_length=30, choices=NOTIFICATION_TYPES)
    title = models.CharField(max_length=300)
    message = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    is_read = models.BooleanField(default=False)
    action_status = models.CharField(max_length=20, choices=ACTION_STATUS_CHOICES, default='pending')
    organisation = models.ForeignKey(
        'customer.CustomerOrganisation',
        on_delete=models.CASCADE,
        null=True, blank=True,
        related_name='notifications',
    )

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.notification_type} → {self.recipient.email} ({self.action_status})"


class Ticket(TimeStampedModel):
    STATUS_CHOICES = [
        ('todo', 'To Do'),
        ('in_progress', 'In Progress'),
        ('resolved', 'Resolved'),
        ('closed', 'Closed'),
    ]
    PRIORITY_CHOICES = [
        ('low', 'Low'),
        ('medium', 'Medium'),
        ('high', 'High'),
        ('urgent', 'Urgent'),
    ]

    queue = models.ForeignKey(Queue, on_delete=models.CASCADE, related_name='tickets')
    title = models.CharField(max_length=300)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='todo')
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='medium')
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='assigned_tickets',
    )
    customer_email = models.EmailField(blank=True)
    conversation = models.ForeignKey(
        'Conversation', on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='tickets',
    )

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"[{self.get_status_display()}] {self.title}"


class Conversation(TimeStampedModel):
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('pending', 'Pending'),
        ('resolved', 'Resolved'),
        ('closed', 'Closed'),
    ]
    CHANNEL_CHOICES = [
        ('web', 'Web'),
        ('email', 'Email'),
        ('whatsapp', 'WhatsApp'),
    ]

    customer = models.ForeignKey(
        'customer.Customer',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='conversations',
    )
    queue = models.ForeignKey(
        Queue, on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='conversations',
    )
    assigned_to = models.ForeignKey(
        CustomerUser, on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='assigned_conversations',
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    channel = models.CharField(max_length=20, choices=CHANNEL_CHOICES, default='web')
    tags = models.JSONField(default=list, blank=True)
    started_at = models.DateTimeField(default=timezone.now)
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-started_at']

    def __str__(self):
        customer_name = self.customer.full_name if self.customer else 'Unknown'
        return f"Conversation with {customer_name} [{self.get_status_display()}]"

    @property
    def elapsed_seconds(self):
        end = self.ended_at or timezone.now()
        return int((end - self.started_at).total_seconds())


class ConversationMessage(models.Model):
    SENDER_TYPE_CHOICES = [
        ('agent', 'Agent'),
        ('customer', 'Customer'),
        ('system', 'System'),
    ]

    conversation = models.ForeignKey(
        Conversation, on_delete=models.CASCADE,
        related_name='messages',
    )
    sender_type = models.CharField(max_length=20, choices=SENDER_TYPE_CHOICES)
    sender_agent = models.ForeignKey(
        CustomerUser, on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='sent_messages',
    )
    content = models.TextField(blank=True)
    rich_body = models.JSONField(null=True, blank=True)
    image = models.ImageField(upload_to='conversation_images/', null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"[{self.sender_type}] {self.content[:50]}"


class QuickReplyTemplate(TimeStampedModel):
    """Pre-written reply templates that agents can insert into the conversation composer."""

    organisation = models.ForeignKey(
        'customer.CustomerOrganisation',
        on_delete=models.CASCADE,
        related_name='quick_reply_templates',
    )
    team = models.ForeignKey(
        Team, on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='quick_reply_templates',
        help_text="If set, only members of this team can see the template",
    )
    title = models.CharField(max_length=200, help_text="Short label shown in the template picker")
    content = models.TextField(help_text="Plain-text content inserted into the composer")
    rich_body = models.JSONField(null=True, blank=True, help_text="Optional Tiptap JSON")
    tags = models.JSONField(default=list, blank=True, help_text="List of tag strings for filtering")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='created_templates',
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['title']

    def __str__(self):
        return f"[Template] {self.title}"


class QuickReplyTemplateHistory(models.Model):
    """Snapshot of a QuickReplyTemplate captured before each edit."""

    template = models.ForeignKey(
        QuickReplyTemplate, on_delete=models.CASCADE,
        related_name='history',
    )
    edited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='template_edits',
    )
    edited_at = models.DateTimeField(auto_now_add=True)
    title = models.CharField(max_length=200)
    content = models.TextField()
    rich_body = models.JSONField(null=True, blank=True)
    tags = models.JSONField(default=list)

    class Meta:
        ordering = ['-edited_at']

    def __str__(self):
        return f"History of template {self.template_id} at {self.edited_at}"


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
