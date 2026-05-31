"""
Integration tests: verify that the SSE Redis-publish chain fires correctly
for decision lifecycle events.

Focus
-----
We patch ``notifications.sse.publish_notification_to_redis`` and assert it is
called with the expected recipient_id.  No real Redis connection is made.

Coverage
--------
* commit() when risk_level=HIGH → AWAITING_APPROVAL fires DECISION_REVIEW_NEEDED
  to the project owner.
* approve() fires DECISION_PUBLISHED to the decision author.
* Self-approval (author == approver) suppresses the notification.
"""

from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIClient

from core.models import CustomUser, Organization, Project, ProjectMember
from decision.models import Decision
from notifications.models import NotificationEventType

_PUBLISH_PATH = "notifications.sse.publish_notification_to_redis"

_COMMIT_READY = {
    "contextSummary": "Context summary for approval test",
    "reasoning": "Reasoning for approval test",
    "riskLevel": "HIGH",  # HIGH → requires_approval=True → AWAITING_APPROVAL
    "confidenceScore": 4,
    "signals": [
        {
            "metric": "ROAS",
            "movement": "SHARP_DECREASE",
            "period": "LAST_7_DAYS",
            "comparison": "PREVIOUS_PERIOD",
        }
    ],
    "options": [
        {"text": "Proceed with reduced budget", "isSelected": True, "order": 1},
        {"text": "Pause campaign", "isSelected": False, "order": 2},
    ],
}


def _make_user(email, username, org):
    user = CustomUser.objects.create_user(
        email=email,
        username=username,
        password="pass12345",
        is_verified=True,
        is_active=True,
    )
    user.organization = org
    user.save(update_fields=["organization"])
    return user


class DecisionNotificationTests(TestCase):
    """
    Verify that decision lifecycle transitions trigger the correct SSE
    Redis publishes.
    """

    def setUp(self):
        self.org = Organization.objects.create(name="DecisionOrg", slug="decisionorg")

        # project owner: will receive DECISION_REVIEW_NEEDED
        self.owner = _make_user("dec_owner@example.com", "dec_owner", self.org)
        # decision author: will receive DECISION_PUBLISHED
        self.author = _make_user("dec_author@example.com", "dec_author", self.org)

        self.project = Project.objects.create(
            name="DecisionProject",
            organization=self.org,
            owner=self.owner,
        )
        ProjectMember.objects.create(user=self.owner, project=self.project, is_active=True)
        ProjectMember.objects.create(user=self.author, project=self.project, is_active=True)

        self.author_client = APIClient()
        self.author_client.force_authenticate(user=self.author)
        self.author_client.credentials(HTTP_X_PROJECT_ID=str(self.project.id))

        self.owner_client = APIClient()
        self.owner_client.force_authenticate(user=self.owner)
        self.owner_client.credentials(HTTP_X_PROJECT_ID=str(self.project.id))

    def _create_draft(self):
        r = self.author_client.post(
            "/api/decisions/drafts/",
            {"title": "High-Risk Decision"},
            format="json",
        )
        self.assertEqual(r.status_code, 201)
        return Decision.objects.get(title="High-Risk Decision")

    def _patch_to_commit_ready(self, decision):
        r = self.author_client.patch(
            f"/api/decisions/drafts/{decision.id}/",
            _COMMIT_READY,
            format="json",
        )
        self.assertEqual(r.status_code, 200)

    # ── commit → AWAITING_APPROVAL fires DECISION_REVIEW_NEEDED ──────────────

    @patch(_PUBLISH_PATH)
    def test_commit_requiring_approval_notifies_project_owner(self, mock_publish):
        """
        When a HIGH-risk decision is committed (→ AWAITING_APPROVAL), the
        project owner must receive a DECISION_REVIEW_NEEDED SSE push.
        """
        decision = self._create_draft()
        self._patch_to_commit_ready(decision)

        r = self.author_client.post(
            f"/api/decisions/{decision.id}/commit/", {}, format="json"
        )
        self.assertEqual(r.status_code, 200)

        decision = Decision.objects.get(pk=decision.id)
        self.assertEqual(decision.status, Decision.Status.AWAITING_APPROVAL)

        mock_publish.assert_called()
        recipient_ids = [c[0][0] for c in mock_publish.call_args_list]
        self.assertIn(
            self.owner.id,
            recipient_ids,
            "project owner must receive DECISION_REVIEW_NEEDED SSE push",
        )
        notif_args = [c[0][1] for c in mock_publish.call_args_list]
        review_notifs = [
            n for n in notif_args
            if n.event_type == NotificationEventType.DECISION_REVIEW_NEEDED
        ]
        self.assertTrue(len(review_notifs) >= 1, "DECISION_REVIEW_NEEDED notification expected")

    # ── approve fires DECISION_PUBLISHED to author ────────────────────────────

    @patch(_PUBLISH_PATH)
    def test_approve_notifies_decision_author(self, mock_publish):
        """
        When the project owner approves a decision (AWAITING_APPROVAL → COMMITTED),
        the decision author must receive a DECISION_PUBLISHED SSE push.
        """
        decision = self._create_draft()
        self._patch_to_commit_ready(decision)

        # Author commits → AWAITING_APPROVAL
        self.author_client.post(
            f"/api/decisions/{decision.id}/commit/", {}, format="json"
        )
        decision = Decision.objects.get(pk=decision.id)
        self.assertEqual(decision.status, Decision.Status.AWAITING_APPROVAL)

        mock_publish.reset_mock()

        # Owner approves
        r = self.owner_client.post(
            f"/api/decisions/{decision.id}/approve/", {}, format="json"
        )
        self.assertEqual(r.status_code, 200)

        mock_publish.assert_called()
        recipient_ids = [c[0][0] for c in mock_publish.call_args_list]
        self.assertIn(
            self.author.id,
            recipient_ids,
            "decision author must receive DECISION_PUBLISHED SSE push",
        )
        notif_args = [c[0][1] for c in mock_publish.call_args_list]
        published_notifs = [
            n for n in notif_args
            if n.event_type == NotificationEventType.DECISION_PUBLISHED
        ]
        self.assertTrue(len(published_notifs) >= 1, "DECISION_PUBLISHED notification expected")

    # ── self-approval suppresses notification ─────────────────────────────────

    @patch(_PUBLISH_PATH)
    def test_self_approval_does_not_fire_decision_published(self, mock_publish):
        """
        When the author and the approver are the same person, no
        DECISION_PUBLISHED notification should be sent.
        """
        # Make the author the project owner so they can approve their own decision
        self.project.owner = self.author
        self.project.save(update_fields=["owner"])

        decision = self._create_draft()
        self._patch_to_commit_ready(decision)

        self.author_client.post(
            f"/api/decisions/{decision.id}/commit/", {}, format="json"
        )
        decision = Decision.objects.get(pk=decision.id)
        self.assertEqual(decision.status, Decision.Status.AWAITING_APPROVAL)

        mock_publish.reset_mock()

        r = self.author_client.post(
            f"/api/decisions/{decision.id}/approve/", {}, format="json"
        )
        self.assertEqual(r.status_code, 200)

        # Only the REVIEW_NEEDED suppress case: author ≠ owner → but here author IS owner,
        # so no DECISION_PUBLISHED should fire (self-approval guard).
        notif_args = [c[0][1] for c in mock_publish.call_args_list]
        published_notifs = [
            n for n in notif_args
            if n.event_type == NotificationEventType.DECISION_PUBLISHED
        ]
        self.assertEqual(
            len(published_notifs),
            0,
            "Self-approval must NOT fire DECISION_PUBLISHED",
        )
