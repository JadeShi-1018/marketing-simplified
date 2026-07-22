from django.test import SimpleTestCase

from notifications.action_urls import (
    decision_action_url,
    meeting_action_url,
    overview_action_url,
    task_action_url,
)


class NotificationActionUrlTests(SimpleTestCase):
    def test_overview_action_url(self):
        self.assertEqual(overview_action_url(), "/overview")

    def test_task_action_url(self):
        self.assertEqual(task_action_url("design-banner"), "/tasks/design-banner")

    def test_meeting_action_url(self):
        self.assertEqual(meeting_action_url("q2-sync", 5), "/meetings/q2-sync?project_id=5")

    def test_decision_action_url(self):
        self.assertEqual(decision_action_url("approve-budget", 3), "/decisions/approve-budget?project_id=3")
