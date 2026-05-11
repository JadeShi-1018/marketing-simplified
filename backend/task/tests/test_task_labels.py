from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model

from core.models import Organization, Project, ProjectMember
from task.models import Task, TaskLabel

User = get_user_model()


class TaskLabelsIntegrationTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="labels@example.com",
            username="labelsuser",
            password="testpass123",
        )
        self.org = Organization.objects.create(name="Label Org")
        self.project = Project.objects.create(name="Label Project", organization=self.org)
        ProjectMember.objects.create(
            user=self.user,
            project=self.project,
            role="Team Leader",
            is_active=True,
        )
        self.client.force_authenticate(user=self.user)

    def test_project_labels_on_task_detail_after_new_labels_create(self):
        """Catalog comes from GET task detail `project_labels`, not /api/tasks/labels/."""
        url = reverse("task-list")
        payload = {
            "summary": "Seed task for label",
            "type": "asset",
            "project_id": self.project.id,
            "create_as_draft": True,
            "new_labels": [{"name": " Urgent ", "color": "#FF00AA"}],
        }
        r = self.client.post(url, payload, format="json")
        self.assertEqual(r.status_code, status.HTTP_201_CREATED)
        self.assertEqual(TaskLabel.objects.filter(project=self.project).count(), 1)

        tid = r.data["id"]
        detail = reverse("task-detail", kwargs={"pk": tid})
        r2 = self.client.get(detail)
        self.assertEqual(r2.status_code, status.HTTP_200_OK)
        self.assertIn("project_labels", r2.data)
        pl = r2.data["project_labels"]
        self.assertEqual(len(pl), 1)
        self.assertEqual(pl[0]["name"], "Urgent")
        self.assertEqual(pl[0]["color"], "#FF00AA")

    def test_task_create_with_label_ids(self):
        label = TaskLabel.objects.create(project=self.project, name="Q1", color="#3CCED7")
        url = reverse("task-list")
        payload = {
            "summary": "Tagged task",
            "type": "asset",
            "project_id": self.project.id,
            "create_as_draft": True,
            "label_ids": [label.id],
        }
        r = self.client.post(url, payload, format="json")
        self.assertEqual(r.status_code, status.HTTP_201_CREATED)
        task = Task.objects.get(id=r.data["id"])
        self.assertEqual(list(task.labels.values_list("id", flat=True)), [label.id])

    def test_task_create_with_new_labels_and_label_ids(self):
        label = TaskLabel.objects.create(project=self.project, name="Existing", color="#111111")
        url = reverse("task-list")
        payload = {
            "summary": "Mixed labels",
            "type": "asset",
            "project_id": self.project.id,
            "create_as_draft": True,
            "label_ids": [label.id],
            "new_labels": [{"name": "Fresh", "color": "#A6E661"}],
        }
        r = self.client.post(url, payload, format="json")
        self.assertEqual(r.status_code, status.HTTP_201_CREATED)
        task = Task.objects.get(id=r.data["id"])
        ids = set(task.labels.values_list("id", flat=True))
        fresh = TaskLabel.objects.get(project=self.project, name="Fresh")
        self.assertEqual(ids, {label.id, fresh.id})

    def test_task_list_filter_by_label_id(self):
        label = TaskLabel.objects.create(project=self.project, name="X", color="#111111")
        t1 = Task.objects.create(summary="A", type="asset", project=self.project, owner=self.user)
        t2 = Task.objects.create(summary="B", type="asset", project=self.project, owner=self.user)
        t1.labels.add(label)

        url = reverse("task-list")
        r = self.client.get(url, {"project_id": self.project.id, "label_id": str(label.id)})
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        body = r.data
        task_rows = body["results"] if isinstance(body, dict) and "results" in body else body
        ids = {row["id"] for row in task_rows}
        self.assertEqual(ids, {t1.id})

    def test_task_list_embeds_labels_on_each_row(self):
        """Board/list UI reads `labels` from GET /api/tasks/ results."""
        label = TaskLabel.objects.create(project=self.project, name="Visible", color="#3CCED7")
        t1 = Task.objects.create(summary="Tagged", type="execution", project=self.project, owner=self.user)
        t1.labels.add(label)

        url = reverse("task-list")
        r = self.client.get(url, {"project_id": self.project.id})
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        body = r.data
        task_rows = body["results"] if isinstance(body, dict) and "results" in body else body
        row = next((x for x in task_rows if x["id"] == t1.id), None)
        self.assertIsNotNone(row)
        self.assertIn("labels", row)
        self.assertEqual(len(row["labels"]), 1)
        self.assertEqual(row["labels"][0]["name"], "Visible")
        self.assertEqual(row["labels"][0]["color"], "#3CCED7")
