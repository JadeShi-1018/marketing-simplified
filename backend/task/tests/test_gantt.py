from datetime import date
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status

from core.models import Project, Organization, ProjectMember
from task.gantt_service import build_gantt_payload
from task.models import Task

User = get_user_model()


class GanttServiceTest(TestCase):
    """Gantt payload helpers — fixtures mirror real task/project naming."""

    def setUp(self):
        self.org = Organization.objects.create(name="Acme Retail Holdings")
        self.project = Project.objects.create(name="Frontend Simplified", organization=self.org)
        self.user = User.objects.create_user(
            email="sarah.chen@acme-retail.test",
            username="sarahchen",
            password="testpass123",
            first_name="Sarah",
            last_name="Chen",
        )
        ProjectMember.objects.create(
            user=self.user, project=self.project, role="Team Lead", is_active=True
        )

    def test_bar_respects_planned_start_and_due(self):
        # Ten-day window: year-open budget task with explicit plan and due dates
        t = Task.objects.create(
            project=self.project,
            type="budget",
            summary="Assign budgets to search and social campaigns missing Q1 allocations",
            priority=Task.Priority.MEDIUM,
            planned_start_date=date(2026, 1, 1),
            due_date=date(2026, 1, 10),
            owner=self.user,
        )
        payload = build_gantt_payload(
            [t],
            today=date(2026, 1, 5),
            sprint_label="Frontend Simplified",
        )
        self.assertEqual(payload["rows"][0]["bar_start"], "2026-01-01")
        self.assertEqual(payload["rows"][0]["bar_end"], "2026-01-10")
        self.assertIn("range", payload)
        self.assertLessEqual(payload["range"]["start"], payload["range"]["end"])

    def test_build_payload_maps_highest_to_highest_band(self):
        # Highest priority: blocked regulatory-style reporting deadline
        t = Task.objects.create(
            project=self.project,
            type="report",
            summary="File audited weekly spend report with finance (deadline this Friday)",
            priority=Task.Priority.HIGHEST,
            owner=self.user,
        )
        today = date(2026, 3, 1)
        payload = build_gantt_payload(
            [t],
            today=today,
            sprint_label="March 2026 compliance reporting",
        )
        self.assertEqual(payload["rows"][0]["band"], "highest")
        self.assertIn("RPT-", payload["rows"][0]["display_key"])


class GanttAPITest(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Northwind Media Group")
        self.project = Project.objects.create(
            name="Paid Social — Sprint 14",
            organization=self.org,
        )
        self.user = User.objects.create_user(
            email="jordan.miles@northwind-media.test",
            username="jmiles",
            password="testpass123",
            first_name="Jordan",
            last_name="Miles",
        )
        ProjectMember.objects.create(
            user=self.user, project=self.project, role="Campaign Manager", is_active=True
        )
        self.user.active_project = self.project
        self.user.save(update_fields=["active_project"])
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_gantt_requires_auth(self):
        c = APIClient()
        r = c.get("/api/tasks/gantt/")
        # Unauthenticated requests should be challenged by the auth layer.
        # DRF typically returns 401 (not 403) when no credentials are provided.
        self.assertEqual(r.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_gantt_returns_rows_for_project(self):
        # Five working-day slice: creative approval cycle within one week
        Task.objects.create(
            project=self.project,
            type="budget",
            summary="Route spring promo asset bundle through legal and brand approval",
            priority=Task.Priority.HIGH,
            start_date=date(2026, 4, 1),
            due_date=date(2026, 4, 5),
            owner=self.user,
        )
        r = self.client.get("/api/tasks/gantt/", {"project_id": self.project.id})
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        body = r.json()
        self.assertEqual(body["task_count"], 1)
        self.assertEqual(len(body["rows"]), 1)
        self.assertIn("range", body)
        self.assertIn("today", body)
        self.assertEqual(body["rows"][0]["duration_days"], 5)
