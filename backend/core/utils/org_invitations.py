"""
Utility functions for handling organization invitations and email sending.
"""
import logging
from datetime import timedelta
from django.utils import timezone
from django.core.mail import send_mail
from django.conf import settings

from core.models import OrganizationInvitation

logger = logging.getLogger(__name__)


def send_org_invitation_email(invitation):
    """
    Send organization invitation email to the invited user.

    Args:
        invitation: OrganizationInvitation instance
    """
    # Skip email for open invitations (email is null)
    if not invitation.email:
        logger.info(f"Skipping email for open invitation {invitation.id} - no specific email")
        return

    try:
        # Get organization name
        org_name = invitation.organization.name

        # Get inviter name safely
        try:
            inviter_name = invitation.invited_by.get_full_name() or invitation.invited_by.email
        except Exception:
            inviter_name = invitation.invited_by.email if invitation.invited_by else "a team member"

        # Build invitation URL
        frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
        accept_url = f"{frontend_url}/invite/organization/{invitation.token}"

        # Email subject
        subject = f"You've been invited to join {org_name}"

        # Role display
        role_display = invitation.role.replace('_', ' ').title()

        # Max uses info
        if invitation.max_uses == 0:
            uses_info = "This is a reusable invitation link."
        elif invitation.max_uses == 1:
            uses_info = "This invitation link is for single use only."
        else:
            uses_info = f"This invitation link can be used {invitation.max_uses} times."

        # Email body (plain text)
        message = f"""
Hello,

You have been invited by {inviter_name} to join the organization "{org_name}" as a {role_display}.

Click the link below to accept the invitation:
{accept_url}

{uses_info}

This invitation will expire on {invitation.expires_at.strftime('%B %d, %Y at %I:%M %p')}.

If you don't have an account yet, you'll be able to create one when you accept the invitation.

Best regards,
The MediaJira Team
"""

        # HTML email body
        html_message = f"""
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background-color: #007bff; color: white; padding: 20px; border-radius: 4px 4px 0 0; }}
        .content {{ padding: 20px; background-color: #f9f9f9; }}
        .button {{ display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }}
        .info-box {{ background-color: #e7f3ff; border-left: 4px solid #007bff; padding: 10px; margin: 15px 0; }}
        .footer {{ margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2 style="margin: 0;">Organization Invitation</h2>
        </div>
        <div class="content">
            <p>Hello,</p>
            <p>You have been invited by <strong>{inviter_name}</strong> to join the organization <strong>"{org_name}"</strong> as a <strong>{role_display}</strong>.</p>

            <div class="info-box">
                <p style="margin: 0;"><strong>Role:</strong> {role_display}</p>
                <p style="margin: 5px 0 0 0;"><small>{uses_info}</small></p>
            </div>

            <p>
                <a href="{accept_url}" class="button">Accept Invitation</a>
            </p>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #007bff; font-size: 12px;">{accept_url}</p>
            <p><small>This invitation will expire on {invitation.expires_at.strftime('%B %d, %Y at %I:%M %p')}.</small></p>
            <p>If you don't have an account yet, you'll be able to create one when you accept the invitation.</p>
        </div>
        <div class="footer">
            <p>Best regards,<br>The MediaJira Team</p>
        </div>
    </div>
</body>
</html>
"""

        # Get email settings
        from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@mediajira.com')

        # Send email
        send_mail(
            subject=subject,
            message=message,
            from_email=from_email,
            recipient_list=[invitation.email],
            html_message=html_message,
            fail_silently=False,
        )

        logger.info(f"Organization invitation email sent to {invitation.email} for organization {org_name}")

    except Exception as e:
        logger.error(f"Failed to send organization invitation email to {invitation.email}: {e}")
        # Don't raise - invitation is still created even if email fails


def create_org_invitation(
    organization,
    invited_by,
    role='member',
    email=None,
    max_uses=1,
    expires_days=7,
):
    """
    Create an organization invitation.

    Args:
        organization: Organization instance
        invited_by: User who is creating the invitation
        role: Role for the invited user (default: 'member')
        email: Email address (optional - if None, creates open invitation)
        max_uses: Maximum number of times the invitation can be used (0 = unlimited)
        expires_days: Number of days until invitation expires (default: 7)

    Returns:
        OrganizationInvitation instance
    """
    from core.utils.invitations import generate_invitation_token

    # Generate token
    token = generate_invitation_token()
    expires_at = timezone.now() + timedelta(days=expires_days)

    # Create invitation
    invitation = OrganizationInvitation.objects.create(
        email=email,
        organization=organization,
        role=role,
        invited_by=invited_by,
        token=token,
        max_uses=max_uses,
        expires_at=expires_at,
        is_active=True,
    )

    # Send email if email is specified
    if email:
        send_org_invitation_email(invitation)

        # Also send in-app notification if this email belongs to an existing user
        _notify_invited_user(invitation, organization, invited_by, role)

    logger.info(
        f"Organization invitation created: org={organization.name}, "
        f"email={email or 'OPEN'}, role={role}, max_uses={max_uses}"
    )

    return invitation


def _notify_invited_user(invitation, organization, invited_by, role):
    """
    If the invited email belongs to an existing user, send them an in-app
    org_invite notification with Accept / Decline buttons.
    """
    from django.contrib.auth import get_user_model  # noqa: PLC0415
    from notifications.models import NotificationCategory, NotificationEventType  # noqa: PLC0415
    from notifications.services import create_notification  # noqa: PLC0415

    User = get_user_model()

    try:
        recipient = User.objects.get(email__iexact=invitation.email)
    except User.DoesNotExist:
        # User doesn't have an account yet — email is the only channel
        return

    role_display = role.replace("_", " ").title()

    try:
        create_notification(
            recipient_id=recipient.id,
            actor_id=invited_by.id,
            category=NotificationCategory.COLLABORATION,
            event_type=NotificationEventType.ORG_INVITE,
            title=f"You've been invited to join {organization.name}",
            body=f"You were invited to join {organization.name} as {role_display}.",
            related_object_type="organization",
            related_object_id=str(organization.id),
            action_url=f"/organizations/{organization.id}",
            metadata={
                "organization_name": organization.name,
                "organization_id": organization.id,
                "role": role,
                "invitation_id": invitation.id,
                "invitation_token": invitation.token,
            },
        )
    except Exception:
        logger.exception(
            "Failed to send org_invite notification to user %s for org %s",
            recipient.id,
            organization.id,
        )
