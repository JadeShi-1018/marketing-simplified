"""
Integration tests: budget lifecycle in-app notifications.
"""

from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase

from budget_approval.models import BudgetRequest, BudgetRequestStatus, BudgetPool
from budget_approval.services import BudgetRequestService
from core.models import CustomUser, Organization, Project, AdChannel
from notifications.models import NotificationEventType
from task.models import Task

_PUBLISH_PATH = "notifications.sse.publish_notification_to_redis"


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


class BudgetNotificationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        # Static data created once for the class — never modified by any test.
        cls.org = Organization.objects.create(name="BudgetNotifOrg", slug="budgetnotiforg")
        cls.requester = _make_user("req@example.com", "requester", cls.org)
        cls.approver = _make_user("appr@example.com", "approver", cls.org)
        cls.project = Project.objects.create(
            name="Budget Project",
            organization=cls.org,
        )
        cls.ad_channel = AdChannel.objects.create(name="Meta", project=cls.project)
        cls.pool = BudgetPool.objects.create(
            project=cls.project,
            ad_channel=cls.ad_channel,
            total_amount=Decimal("10000.00"),
            used_amount=Decimal("0.00"),
            currency="AUD",
        )

    def setUp(self):
        # Mutable FSM objects recreated fresh for each test.
        # Refresh pool in case a prior test mutated used_amount on the DB row.
        self.pool.refresh_from_db()
        self.task = Task.objects.create(
            summary="Q1 budget increase",
            type="budget",
            project=self.project,
            owner=self.requester,
        )
        self.br = BudgetRequest.objects.create(
            task=self.task,
            requested_by=self.requester,
            amount=Decimal("500.00"),
            currency="AUD",
            status=BudgetRequestStatus.DRAFT,
            budget_pool=self.pool,
            current_approver=self.approver,
            ad_channel=self.ad_channel,
        )

    def _reload_br(self):
        """Re-fetch BR; django-fsm forbids refresh_from_db on status."""
        self.br = BudgetRequest.objects.get(pk=self.br.pk)

    @patch(_PUBLISH_PATH)
    def test_submit_notifies_approver(self, mock_publish):
        with self.captureOnCommitCallbacks(execute=True):
            BudgetRequestService.submit_budget_request(self.br, self.approver)
        mock_publish.assert_called()
        recipient_ids = [c[0][0] for c in mock_publish.call_args_list]
        self.assertIn(self.approver.id, recipient_ids)
        events = [c[0][1].event_type for c in mock_publish.call_args_list]
        self.assertIn(NotificationEventType.BUDGET_REVIEW_NEEDED, events)

    @patch(_PUBLISH_PATH)
    def test_approve_notifies_requester(self, mock_publish):
        with self.captureOnCommitCallbacks(execute=True):
            BudgetRequestService.submit_budget_request(self.br, self.approver)
        self._reload_br()
        with self.captureOnCommitCallbacks(execute=True):
            BudgetRequestService.start_review(self.br)
        self._reload_br()
        mock_publish.reset_mock()

        with self.captureOnCommitCallbacks(execute=True):
            BudgetRequestService.process_approval(
                self.br,
                approver=self.approver,
                is_approved=True,
                comment="Looks good",
            )
        recipient_ids = [c[0][0] for c in mock_publish.call_args_list]
        self.assertIn(self.requester.id, recipient_ids)
        events = [c[0][1].event_type for c in mock_publish.call_args_list]
        self.assertIn(NotificationEventType.BUDGET_APPROVAL_RESULT, events)

    @patch(_PUBLISH_PATH)
    def test_reject_notifies_requester(self, mock_publish):
        with self.captureOnCommitCallbacks(execute=True):
            BudgetRequestService.submit_budget_request(self.br, self.approver)
        self._reload_br()
        with self.captureOnCommitCallbacks(execute=True):
            BudgetRequestService.start_review(self.br)
        self._reload_br()
        mock_publish.reset_mock()

        with self.captureOnCommitCallbacks(execute=True):
            BudgetRequestService.process_approval(
                self.br,
                approver=self.approver,
                is_approved=False,
                comment="Not enough detail",
            )
        recipient_ids = [c[0][0] for c in mock_publish.call_args_list]
        self.assertIn(self.requester.id, recipient_ids)

    @patch(_PUBLISH_PATH)
    def test_forward_notifies_next_approver(self, mock_publish):
        next_approver = _make_user("next@example.com", "nextapprover", self.org)
        with self.captureOnCommitCallbacks(execute=True):
            BudgetRequestService.submit_budget_request(self.br, self.approver)
        self._reload_br()
        with self.captureOnCommitCallbacks(execute=True):
            BudgetRequestService.start_review(self.br)
        self._reload_br()
        mock_publish.reset_mock()

        with self.captureOnCommitCallbacks(execute=True):
            BudgetRequestService.process_approval(
                self.br,
                approver=self.approver,
                is_approved=True,
                comment="Forwarding",
                next_approver=next_approver,
            )
        recipient_ids = [c[0][0] for c in mock_publish.call_args_list]
        self.assertIn(next_approver.id, recipient_ids)
        events = [c[0][1].event_type for c in mock_publish.call_args_list]
        self.assertIn(NotificationEventType.BUDGET_REVIEW_NEEDED, events)

    @patch(_PUBLISH_PATH)
    def test_lock_notifies_requester(self, mock_publish):
        with self.captureOnCommitCallbacks(execute=True):
            BudgetRequestService.submit_budget_request(self.br, self.approver)
        self._reload_br()
        with self.captureOnCommitCallbacks(execute=True):
            BudgetRequestService.start_review(self.br)
        self._reload_br()
        with self.captureOnCommitCallbacks(execute=True):
            BudgetRequestService.process_approval(
                self.br,
                approver=self.approver,
                is_approved=True,
                comment="Approved",
            )
        self._reload_br()
        mock_publish.reset_mock()

        with self.captureOnCommitCallbacks(execute=True):
            BudgetRequestService.lock_budget_request(self.br, actor_id=self.approver.id)
        recipient_ids = [c[0][0] for c in mock_publish.call_args_list]
        self.assertIn(self.requester.id, recipient_ids)

    @patch(_PUBLISH_PATH)
    def test_pool_insufficient_notifies_requester(self, mock_publish):
        with self.captureOnCommitCallbacks(execute=True):
            BudgetRequestService.submit_budget_request(self.br, self.approver)
        self._reload_br()
        with self.captureOnCommitCallbacks(execute=True):
            BudgetRequestService.start_review(self.br)
        self._reload_br()
        with self.captureOnCommitCallbacks(execute=True):
            BudgetRequestService.process_approval(
                self.br,
                approver=self.approver,
                is_approved=True,
                comment="Approved",
            )
        self._reload_br()

        # Drain pool after approval so lock fails at deduction time.
        self.pool.used_amount = Decimal("9950.00")
        self.pool.save(update_fields=["used_amount"])
        mock_publish.reset_mock()

        with self.assertRaises(Exception):
            with self.captureOnCommitCallbacks(execute=True):
                BudgetRequestService.lock_budget_request(self.br, actor_id=self.approver.id)

        recipient_ids = [c[0][0] for c in mock_publish.call_args_list]
        self.assertIn(self.requester.id, recipient_ids)
        events = [c[0][1].event_type for c in mock_publish.call_args_list]
        self.assertIn(NotificationEventType.BUDGET_POOL_LOW, events)

    @patch(_PUBLISH_PATH)
    def test_cancel_notifies_stakeholders(self, mock_publish):
        with self.captureOnCommitCallbacks(execute=True):
            BudgetRequestService.submit_budget_request(self.br, self.approver)
        self._reload_br()
        mock_publish.reset_mock()

        with self.captureOnCommitCallbacks(execute=True):
            BudgetRequestService.cancel_budget_request(self.br, actor_id=self.requester.id)
        recipient_ids = [c[0][0] for c in mock_publish.call_args_list]
        self.assertIn(self.approver.id, recipient_ids)

    @patch(_PUBLISH_PATH)
    def test_self_submit_skip_when_requester_is_approver(self, mock_publish):
        self.br.current_approver = self.requester
        self.br.save(update_fields=["current_approver"])
        with self.captureOnCommitCallbacks(execute=True):
            BudgetRequestService.submit_budget_request(self.br, self.requester)
        mock_publish.assert_not_called()
