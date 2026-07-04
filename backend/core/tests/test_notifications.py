"""
Integration tests: verify that the SSE Redis-publish chain fires correctly
for project-membership events (PROJECT_INVITE).

Focus
-----
We patch ``notifications.sse.publish_notification_to_redis`` – the final
function that writes to Redis – and assert it is called with the expected
recipient_id.  No real Redis connection is made.

Coverage
--------
* Accepting a project invitation fires PROJECT_INVITE to the new member.
* If the inviter and the new member are the same person, no notification is sent.
"""

from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from core.models import CustomUser, Organization, Project, ProjectInvitation, ProjectMember
from core.utils.invitations import accept_invitation
from notifications.models import NotificationEventType

_PUBLISH_PATH = "notifications.sse.publish_notification_to_redis"


class ProjectInviteNotificationTests(TestCase):
    """
    Verify that accepting a project invitation triggers the PROJECT_INVITE
    SSE Redis publish for the new member.
    """

    def setUp(self):
        self.org = Organization.objects.create(name="InviteOrg", slug="inviteorg")

        self.owner = CustomUser.objects.create_user(
            email="owner@invite.example.com",
            password="pass12345",
            username="invite_owner",
        )
        self.owner.organization = self.org
        self.owner.save(update_fields=["organization"])

        self.project = Project.objects.create(
            name="InviteProject",
            organization=self.org,
            owner=self.owner,
        )
        ProjectMember.objects.create(user=self.owner, project=self.project, is_active=True)

        self.invitee = CustomUser.objects.create_user(
            email="invitee@invite.example.com",
            password="pass12345",
            username="invite_invitee",
        )
        self.invitee.organization = self.org
        self.invitee.save(update_fields=["organization"])

    def _make_invitation(self, *, invited_by=None):
        if invited_by is None:
            invited_by = self.owner
        return ProjectInvitation.objects.create(
            email=self.invitee.email,
            project=self.project,
            invited_by=invited_by,
            token="test-token-abc123",
            expires_at=timezone.now() + timezone.timedelta(days=7),
            approved=True,
            approved_by=invited_by,
            approved_at=timezone.now(),
        )

    # ── positive: invitee ≠ inviter ──────────────────────────────────────────

    @patch(_PUBLISH_PATH)
    def test_accepting_invitation_fires_project_invite_to_new_member(self, mock_publish):
        """
        accept_invitation() must call publish_notification_to_redis for the
        newly added member with a PROJECT_INVITE notification.
        """
        invitation = self._make_invitation()

        def call_immediately(func, using=None):
            func()

        with patch('django.db.transaction.on_commit', side_effect=call_immediately):
            accept_invitation(token=invitation.token, user=self.invitee)

        mock_publish.assert_called()
        recipient_ids = [c[0][0] for c in mock_publish.call_args_list]
        self.assertIn(
            self.invitee.id,
            recipient_ids,
            "invitee must receive PROJECT_INVITE SSE push",
        )
        # Verify the event type on the Notification object passed to publish
        notif_args = [c[0][1] for c in mock_publish.call_args_list]
        invite_notifs = [
            n for n in notif_args
            if n.event_type == NotificationEventType.PROJECT_INVITE
        ]
        self.assertTrue(len(invite_notifs) >= 1, "At least one PROJECT_INVITE notification expected")
        self.assertEqual(invite_notifs[0].metadata.get("project_name"), self.project.name)

    # ── negative: owner invites themselves ───────────────────────────────────

    @patch(_PUBLISH_PATH)
    def test_self_invitation_does_not_fire_publish(self, mock_publish):
        """
        When the inviter and the invitee are the same user, no notification
        should be published (self-invitation suppressed).
        """
        # Override invitee to be the owner themselves
        invitation = ProjectInvitation.objects.create(
            email=self.owner.email,
            project=self.project,
            invited_by=self.owner,
            token="self-token-xyz789",
            expires_at=timezone.now() + timezone.timedelta(days=7),
            approved=True,
            approved_by=self.owner,
            approved_at=timezone.now(),
        )
        accept_invitation(token=invitation.token, user=self.owner)
        mock_publish.assert_not_called()
