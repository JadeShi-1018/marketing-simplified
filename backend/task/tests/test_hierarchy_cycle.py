from django.contrib.auth import get_user_model
from django.test import TestCase

from core.models import Organization, Project
from task.models import Task, TaskHierarchy, would_create_task_hierarchy_cycle

User = get_user_model()


class TaskHierarchyCycleDetectionTest(TestCase):
    """Unit tests for would_create_task_hierarchy_cycle (MED-235)."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="user@example.com",
            username="user",
            password="testpass123",
        )
        self.organization = Organization.objects.create(name="Test Org")
        self.project = Project.objects.create(
            name="Test Project",
            organization=self.organization,
        )

        self.task_a = Task.objects.create(
            summary="Task A",
            type="asset",
            project=self.project,
            owner=self.user,
        )
        self.task_b = Task.objects.create(
            summary="Task B",
            type="asset",
            project=self.project,
            owner=self.user,
        )
        self.task_c = Task.objects.create(
            summary="Task C",
            type="asset",
            project=self.project,
            owner=self.user,
        )
        self.task_d = Task.objects.create(
            summary="Task D",
            type="asset",
            project=self.project,
            owner=self.user,
        )

    def test_self_reference_is_cycle(self):
        self.assertTrue(
            would_create_task_hierarchy_cycle(self.task_a.id, self.task_a.id)
        )

    def test_unrelated_tasks_no_cycle(self):
        self.assertFalse(
            would_create_task_hierarchy_cycle(self.task_a.id, self.task_d.id)
        )

    def test_two_node_cycle_a_to_b_then_b_to_a(self):
        TaskHierarchy.objects.create(
            parent_task=self.task_a,
            child_task=self.task_b,
        )

        self.assertTrue(
            would_create_task_hierarchy_cycle(self.task_b.id, self.task_a.id)
        )

    def test_three_node_cycle_a_b_c_then_c_to_a(self):
        TaskHierarchy.objects.create(
            parent_task=self.task_a,
            child_task=self.task_b,
        )
        TaskHierarchy.objects.create(
            parent_task=self.task_b,
            child_task=self.task_c,
        )

        self.assertTrue(
            would_create_task_hierarchy_cycle(self.task_c.id, self.task_a.id)
        )

    def test_excluding_edge_allows_move_without_false_positive(self):
        """Reassigning parent: ignore the edge being removed when checking."""
        TaskHierarchy.objects.create(
            parent_task=self.task_a,
            child_task=self.task_b,
        )

        # Move B from A to C — not a cycle if we exclude the old A→B edge
        self.assertFalse(
            would_create_task_hierarchy_cycle(
                self.task_c.id,
                self.task_b.id,
                excluding_edges=[(self.task_a.id, self.task_b.id)],
            )
        )
