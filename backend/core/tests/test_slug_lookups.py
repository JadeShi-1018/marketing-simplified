"""
SMP-539: slug-only resource lookups.

Covers the shared slug infrastructure:
- slug generation rules (source field, duplicates, numeric titles, empty fallback, rename stability)
- resolve_lookup_kwargs routing (slug vs UUID pk vs numeric)
- API behaviour: slug URL resolves (200), numeric URL is rejected (404)
- migration-style backfill helper
"""
import uuid

from django.contrib.auth import get_user_model
from django.core.management import call_command
from rest_framework.test import APITestCase

from core.models import Organization, Project, ProjectMember
from core.slug_backfill import backfill_slugs
from core.slug_mixins import resolve_lookup_kwargs
from task.models import Task
from meetings.models import Meeting, MeetingTypeDefinition
from decision.models import Decision
from spreadsheet.models import Spreadsheet
from automationWorkflow.models import Workflow

User = get_user_model()


class ResolveLookupKwargsTest(APITestCase):
    """Pure routing rules of the shared lookup helper."""

    def test_plain_string_resolves_by_slug(self):
        self.assertEqual(resolve_lookup_kwargs("april-budget"), {"slug": "april-budget"})

    def test_numeric_string_resolves_by_slug_not_pk(self):
        # slug-only: numeric identifiers are never treated as primary keys
        self.assertEqual(resolve_lookup_kwargs("123"), {"slug": "123"})

    def test_uuid_resolves_by_pk(self):
        value = str(uuid.uuid4())
        self.assertEqual(resolve_lookup_kwargs(value), {"pk": value})

    def test_custom_pk_and_slug_fields(self):
        value = str(uuid.uuid4())
        self.assertEqual(
            resolve_lookup_kwargs(value, "workflow_id", "workflow__slug"),
            {"workflow_id": value},
        )
        self.assertEqual(
            resolve_lookup_kwargs("client-flow", "workflow_id", "workflow__slug"),
            {"workflow__slug": "client-flow"},
        )


class SlugGenerationTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="slugger@example.com", username="slugger", password="testpass123"
        )
        self.organization = Organization.objects.create(name="Slug Org")
        self.project = Project.objects.create(
            name="Slug Project", organization=self.organization
        )

    def _task(self, summary):
        return Task.objects.create(
            summary=summary, type="asset", project=self.project, owner=self.user
        )

    def test_slug_from_source_field(self):
        task = self._task("Design Homepage Banner")
        self.assertEqual(task.slug, "design-homepage-banner")

    def test_duplicate_titles_get_counter_suffix(self):
        first = self._task("Quarterly Review")
        second = self._task("Quarterly Review")
        self.assertEqual(first.slug, "quarterly-review")
        self.assertEqual(second.slug, "quarterly-review-1")

    def test_pure_numeric_title_is_prefixed(self):
        # a slug that looks like a legacy numeric id would be ambiguous
        task = self._task("2024")
        self.assertEqual(task.slug, "task-2024")

    def test_unslugifiable_title_falls_back_to_uuid_slug(self):
        task = self._task("测试中文标题")
        self.assertRegex(task.slug, r"^task-[0-9a-f]{8}$")

    def test_slug_is_stable_across_rename(self):
        task = self._task("Original Name")
        original_slug = task.slug
        task.summary = "Renamed Completely"
        task.save()
        task = Task.objects.get(pk=task.pk)
        self.assertEqual(task.slug, original_slug)

    def test_project_slug_generated(self):
        self.assertEqual(self.project.slug, "slug-project")


class SlugOnlyApiLookupTest(APITestCase):
    """Slug URLs resolve; numeric URLs 404 (Ray's slug-only decision)."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="member@example.com", username="member", password="testpass123"
        )
        self.organization = Organization.objects.create(name="API Org")
        self.project = Project.objects.create(
            name="API Project", organization=self.organization
        )
        ProjectMember.objects.create(
            user=self.user, project=self.project, role="Team Leader", is_active=True
        )
        self.user.active_project = self.project
        self.user.save(update_fields=["active_project"])
        
        self.task = Task.objects.create(
            summary="Slug Lookup Task",
            type="asset",
            project=self.project,
            owner=self.user,
        )
        self.meeting_type = MeetingTypeDefinition.objects.create(
            project=self.project,
            slug="planning",
            label="Planning",
        )
        self.meeting = Meeting.objects.create(
            title="Slug Lookup Meeting",
            project=self.project,
            type_definition=self.meeting_type,
        )
        self.decision = Decision.objects.create(
            title="Slug Lookup Decision",
            project=self.project,
            author=self.user,
        )
        self.spreadsheet = Spreadsheet.objects.create(
            name="Slug Lookup Spreadsheet",
            project=self.project,
        )
        self.workflow = Workflow.objects.create(
            name="Slug Lookup Workflow",
            project=self.project,
            created_by=self.user,
        )
        
        self.client.force_authenticate(user=self.user)

    def test_task_slug_url_resolves(self):
        response = self.client.get(f"/api/tasks/{self.task.slug}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["id"], self.task.id)
        self.assertEqual(response.data["slug"], self.task.slug)

    def test_task_numeric_url_is_rejected(self):
        response = self.client.get(f"/api/tasks/{self.task.id}/")
        self.assertEqual(response.status_code, 404)

    def test_unknown_slug_404(self):
        response = self.client.get("/api/tasks/no-such-task/")
        self.assertEqual(response.status_code, 404)

    def test_project_slug_url_resolves(self):
        response = self.client.get(f"/api/core/projects/{self.project.slug}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["id"], self.project.id)

    def test_project_numeric_url_is_rejected(self):
        response = self.client.get(f"/api/core/projects/{self.project.id}/")
        self.assertEqual(response.status_code, 404)

    def test_meeting_slug_url_resolves(self):
        response = self.client.get(f"/api/projects/{self.project.slug}/meetings/{self.meeting.slug}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["id"], self.meeting.id)

    def test_meeting_numeric_url_is_rejected(self):
        response = self.client.get(f"/api/projects/{self.project.slug}/meetings/{self.meeting.id}/")
        self.assertEqual(response.status_code, 404)

    def test_decision_slug_url_resolves(self):
        response = self.client.get(f"/api/decisions/{self.decision.slug}/", HTTP_X_PROJECT_ID=str(self.project.id))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["id"], self.decision.id)

    def test_decision_numeric_url_is_rejected(self):
        response = self.client.get(f"/api/decisions/{self.decision.id}/", HTTP_X_PROJECT_ID=str(self.project.id))
        self.assertEqual(response.status_code, 404)

    def test_spreadsheet_slug_url_resolves(self):
        response = self.client.get(f"/api/spreadsheet/spreadsheets/{self.spreadsheet.slug}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["id"], self.spreadsheet.id)

    def test_spreadsheet_numeric_url_is_rejected(self):
        response = self.client.get(f"/api/spreadsheet/spreadsheets/{self.spreadsheet.id}/")
        self.assertEqual(response.status_code, 404)

    def test_workflow_slug_url_resolves(self):
        response = self.client.get(f"/api/workflows/{self.workflow.slug}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["id"], self.workflow.id)

    def test_workflow_numeric_url_is_rejected(self):
        response = self.client.get(f"/api/workflows/{self.workflow.id}/")
        self.assertEqual(response.status_code, 404)


class SlugBackfillTest(APITestCase):
    """core/slug_backfill.py mirrors the mixin rules for migration RunPython."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="backfill@example.com", username="backfill", password="testpass123"
        )
        self.organization = Organization.objects.create(name="Backfill Org")
        self.project = Project.objects.create(
            name="Backfill Project", organization=self.organization
        )

    def test_backfill_populates_null_slugs(self):
        tasks = []
        for summary in ["Alpha Launch", "Alpha Launch", "2030", "中文"]:
            task = Task.objects.create(
                summary=summary, type="asset", project=self.project, owner=self.user
            )
            tasks.append(task)
        for idx, task in enumerate(tasks):
            Task.objects.filter(pk=task.pk).update(slug=f"temp-empty-{idx}")

        backfill_slugs(Task, source_field="summary")

        slugs = list(
            Task.objects.filter(pk__in=[t.pk for t in tasks])
            .order_by("pk")
            .values_list("slug", flat=True)
        )
        self.assertEqual(slugs[0], "alpha-launch")
        self.assertEqual(slugs[1], "alpha-launch-1")
        self.assertEqual(slugs[2], "task-2030")
        self.assertRegex(slugs[3], r"^task-[0-9a-f]{8}$")
        self.assertFalse(Task.objects.filter(slug__isnull=True).exists())

    def test_backfill_management_command(self):
        # Verify management command runs without errors
        meeting_type = MeetingTypeDefinition.objects.create(
            project=self.project,
            slug="planning",
            label="Planning",
        )
        meeting = Meeting.objects.create(
            title="Meeting to Backfill",
            project=self.project,
            type_definition=meeting_type,
        )
        Meeting.objects.filter(pk=meeting.pk).update(slug="temp-empty-0")
        
        # Run command
        call_command("backfill_slugs")
        
        meeting.refresh_from_db()
        self.assertIsNotNone(meeting.slug)
        self.assertEqual(meeting.slug, "meeting-to-backfill")
