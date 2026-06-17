from django.db import models
from django.db.models import Q
from django.conf import settings
from django.utils import timezone
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

    # --- CSM-S01-07: form submission context ---
    form = models.ForeignKey(
        'TicketForm', on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='tickets',
    )
    experience_group = models.ForeignKey(
        'experience_group.ExperienceGroup', on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='tickets',
    )
    support_project = models.ForeignKey(
        'SupportProject', on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='tickets',
    )
    work_type = models.ForeignKey(
        'CsmWorkType', on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='tickets',
    )
    custom_field_values = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"[{self.get_status_display()}] {self.title}"


# ---------------------------------------------------------------------------
# CSM-S01-07 — Ticket form builder (Phase 1)
# ---------------------------------------------------------------------------

class SupportProject(TimeStampedModel):
    """Stub for CSM-S01-08. Tables only in S01-07; no CRUD API yet."""

    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name='support_projects',
    )
    name = models.CharField(max_length=200)
    is_archived = models.BooleanField(default=False)
    default_queue = models.ForeignKey(
        Queue, on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='default_for_support_projects',
    )

    class Meta:
        ordering = ['name']
        constraints = [
            models.UniqueConstraint(
                fields=['project', 'name'],
                name='csm_support_project_unique_name_per_project',
            ),
        ]

    def __str__(self):
        return f"{self.name} ({self.project_id})"


class CsmWorkType(TimeStampedModel):
    """Stub for CSM-S01-08. Tables only in S01-07; no CRUD API yet."""

    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name='csm_work_types',
    )
    name = models.CharField(max_length=200)
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['sort_order', 'name']
        constraints = [
            models.UniqueConstraint(
                fields=['project', 'name'],
                name='csm_work_type_unique_name_per_project',
            ),
        ]

    def __str__(self):
        return self.name


class TicketForm(TimeStampedModel):
    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name='ticket_forms',
    )
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='created_ticket_forms',
    )

    class Meta:
        ordering = ['-updated_at', 'name']
        constraints = [
            models.UniqueConstraint(
                fields=['project'],
                condition=Q(is_default=True),
                name='csm_unique_default_ticket_form_per_project',
            ),
        ]
        indexes = [
            models.Index(fields=['project', 'is_default'], name='csm_tf_proj_default_idx'),
        ]

    def __str__(self):
        suffix = ' (default)' if self.is_default else ''
        return f"{self.name}{suffix}"


class TicketFormField(models.Model):
    class FieldType(models.TextChoices):
        SYSTEM_SUMMARY = 'system_summary', 'Summary'
        SYSTEM_DESCRIPTION = 'system_description', 'Description'
        SYSTEM_PROJECT = 'system_project', 'Project'
        SYSTEM_WORK_TYPE = 'system_work_type', 'Work Type'
        SHORT_TEXT = 'short_text', 'Short text'
        PARAGRAPH = 'paragraph', 'Paragraph'
        TIMESTAMP = 'timestamp', 'Timestamp'
        DROPDOWN = 'dropdown', 'Dropdown'
        DATE = 'date', 'Date'
        NUMBER = 'number', 'Number'
        LABELS = 'labels', 'Labels'
        CHECKBOX = 'checkbox', 'Checkbox'
        PEOPLE = 'people', 'People'
        URL = 'url', 'URL'
        FILE = 'file', 'File attachment'

    SYSTEM_FIELD_KEYS = frozenset({'summary', 'description', 'project', 'work_type'})

    OPTION_FIELD_TYPES = frozenset({
        FieldType.DROPDOWN,
        FieldType.CHECKBOX,
    })

    form = models.ForeignKey(
        TicketForm, on_delete=models.CASCADE, related_name='fields',
    )
    field_key = models.SlugField(max_length=100)
    label = models.CharField(max_length=200)
    field_type = models.CharField(max_length=30, choices=FieldType.choices)
    is_required = models.BooleanField(default=False)
    sort_order = models.PositiveIntegerField(default=0)
    options = models.JSONField(default=list, blank=True)
    field_config = models.JSONField(default=dict, blank=True)
    help_text = models.CharField(max_length=500, blank=True)
    max_files = models.PositiveSmallIntegerField(default=10)
    max_file_size_mb = models.PositiveSmallIntegerField(default=25)

    class Meta:
        ordering = ['sort_order', 'id']
        constraints = [
            models.UniqueConstraint(
                fields=['form', 'field_key'],
                name='csm_ticketformfield_unique_key_per_form',
            ),
        ]
        indexes = [
            models.Index(fields=['form', 'sort_order'], name='csm_tff_form_order_idx'),
        ]

    def __str__(self):
        return f"{self.form_id}:{self.field_key}"


class TicketFormAssignment(models.Model):
    form = models.ForeignKey(
        TicketForm, on_delete=models.CASCADE, related_name='assignments',
    )
    experience_group = models.ForeignKey(
        'experience_group.ExperienceGroup', on_delete=models.CASCADE,
        null=True, blank=True,
        related_name='ticket_form_assignments',
    )
    support_project = models.ForeignKey(
        SupportProject, on_delete=models.CASCADE,
        null=True, blank=True,
        related_name='ticket_form_assignments',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['experience_group'],
                condition=Q(experience_group__isnull=False),
                name='csm_ticketformassignment_unique_per_eg',
            ),
            models.UniqueConstraint(
                fields=['support_project'],
                condition=Q(support_project__isnull=False),
                name='csm_ticketformassignment_unique_per_support_project',
            ),
            models.CheckConstraint(
                check=Q(experience_group__isnull=False) | Q(support_project__isnull=False),
                name='csm_ticketformassignment_requires_target',
            ),
        ]

    def __str__(self):
        if self.experience_group_id:
            return f"Form {self.form_id} → EG {self.experience_group_id}"
        return f"Form {self.form_id} → SP {self.support_project_id}"


class TicketFormSubmission(models.Model):
    form = models.ForeignKey(
        TicketForm, on_delete=models.CASCADE, related_name='submissions',
    )
    experience_group = models.ForeignKey(
        'experience_group.ExperienceGroup', on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='ticket_form_submissions',
    )
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='ticket_form_submissions',
    )
    payload = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Submission {self.id} (form {self.form_id})"


def ticket_attachment_upload_to(instance, filename):
    now = timezone.now()
    return f"csm/ticket_attachments/{now:%Y/%m/%d}/{filename}"


class TicketAttachment(models.Model):
    ticket = models.ForeignKey(
        Ticket, on_delete=models.CASCADE,
        null=True, blank=True,
        related_name='attachments',
    )
    submission = models.ForeignKey(
        TicketFormSubmission, on_delete=models.CASCADE,
        null=True, blank=True,
        related_name='attachments',
    )
    file = models.FileField(upload_to=ticket_attachment_upload_to, max_length=500)
    original_name = models.CharField(max_length=255)
    size_bytes = models.PositiveIntegerField(default=0)
    content_type = models.CharField(max_length=100, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                check=Q(ticket__isnull=False) | Q(submission__isnull=False),
                name='csm_ticketattachment_requires_parent',
            ),
        ]

    def __str__(self):
        return self.original_name or str(self.file)


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
