"""
Unit tests for TriggerExecutionService.
Tests rate limiting, deduplication, and condition evaluation.
"""

from django.test import TestCase
from django.utils import timezone
from datetime import timedelta

from agent.models import (
    AgentWorkflowDefinition,
    WorkflowTriggerLog,
    WorkflowTriggerState,
)
from agent.trigger_service import TriggerExecutionService
from core.models import Project, Organization
from django.contrib.auth import get_user_model

User = get_user_model()


class TriggerExecutionServiceTests(TestCase):
    def setUp(self):
        """Set up test data."""
        # Create test user
        self.user = User.objects.create_user(
            email='test@example.com',
            password='testpass123',
            first_name='Test',
            last_name='User',
        )

        # Create test organization and project
        self.organization = Organization.objects.create(
            name='Test Org',
            owner=self.user,
        )

        self.project = Project.objects.create(
            name='Test Project',
            organization=self.organization,
            created_by=self.user,
        )

        # Create test workflow
        self.workflow = AgentWorkflowDefinition.objects.create(
            name='Test Workflow',
            description='Test workflow for trigger testing',
            project=self.project,
            created_by=self.user,
            status='active',
            trigger_enabled=True,
            trigger_config={
                'trigger_type': 'instant',
                'instant': {
                    'event_types': ['task.created'],
                    'webhook_enabled': False,
                }
            }
        )

    def test_workflow_models_created(self):
        """Test that workflow and trigger models are created successfully."""
        self.assertIsNotNone(self.workflow.id)
        self.assertEqual(self.workflow.name, 'Test Workflow')
        self.assertTrue(self.workflow.trigger_enabled)
        self.assertEqual(self.workflow.trigger_config['trigger_type'], 'instant')

    def test_rate_limit_enforcement(self):
        """Test that rate limiting prevents excessive triggers."""
        # Trigger 100 times should succeed
        for i in range(100):
            result = TriggerExecutionService.execute_workflow_trigger(
                workflow_id=str(self.workflow.id),
                trigger_type='manual',
                trigger_context={'test': i},
                user=self.user,
                project=self.project,
            )
            self.assertIsNotNone(result, f"Trigger {i} should succeed")

        # 101st should be rate limited
        result = TriggerExecutionService.execute_workflow_trigger(
            workflow_id=str(self.workflow.id),
            trigger_type='manual',
            trigger_context={'test': 100},
            user=self.user,
            project=self.project,
        )
        self.assertIsNone(result, "101st trigger should be rate limited")

        # Check log shows "skipped"
        log = WorkflowTriggerLog.objects.filter(workflow=self.workflow).last()
        self.assertEqual(log.status, 'skipped')
        self.assertIn('rate limit', log.error_message.lower())

    def test_deduplication_within_window(self):
        """Test that duplicate triggers are prevented within dedup window."""
        context = {'event_type': 'task.created', 'task_id': 123}

        # First trigger should succeed
        result1 = TriggerExecutionService.execute_workflow_trigger(
            workflow_id=str(self.workflow.id),
            trigger_type='instant',
            trigger_context=context,
            user=self.user,
            project=self.project,
        )
        self.assertIsNotNone(result1, "First trigger should succeed")

        # Immediate duplicate should be skipped
        result2 = TriggerExecutionService.execute_workflow_trigger(
            workflow_id=str(self.workflow.id),
            trigger_type='instant',
            trigger_context=context,
            user=self.user,
            project=self.project,
        )
        self.assertIsNone(result2, "Duplicate trigger should be skipped")

        # Check log
        log = WorkflowTriggerLog.objects.filter(workflow=self.workflow).last()
        self.assertEqual(log.status, 'skipped')
        self.assertIn('duplicate', log.error_message.lower())

    def test_different_context_not_deduplicated(self):
        """Test that different trigger contexts are not deduplicated."""
        context1 = {'event_type': 'task.created', 'task_id': 123}
        context2 = {'event_type': 'task.created', 'task_id': 456}

        # First trigger
        result1 = TriggerExecutionService.execute_workflow_trigger(
            workflow_id=str(self.workflow.id),
            trigger_type='instant',
            trigger_context=context1,
            user=self.user,
            project=self.project,
        )
        self.assertIsNotNone(result1)

        # Different context should also succeed
        result2 = TriggerExecutionService.execute_workflow_trigger(
            workflow_id=str(self.workflow.id),
            trigger_type='instant',
            trigger_context=context2,
            user=self.user,
            project=self.project,
        )
        self.assertIsNotNone(result2, "Different context should not be deduplicated")

    def test_manual_trigger_bypasses_enabled_check(self):
        """Test that manual triggers work even when trigger_enabled is False."""
        # Disable triggers
        self.workflow.trigger_enabled = False
        self.workflow.save()

        # Manual trigger should still work
        result = TriggerExecutionService.execute_workflow_trigger(
            workflow_id=str(self.workflow.id),
            trigger_type='manual',
            trigger_context={'user_initiated': True},
            user=self.user,
            project=self.project,
        )
        self.assertIsNotNone(result, "Manual trigger should bypass enabled check")

    def test_polling_condition_evaluation(self):
        """Test polling trigger condition evaluation."""
        # Set up workflow with polling conditions
        self.workflow.trigger_config = {
            'trigger_type': 'polling',
            'polling': {
                'interval_minutes': 15,
                'data_sources': ['spreadsheet'],
                'conditions': [
                    {
                        'type': 'spreadsheet_upload',
                        'project_id': self.project.id,
                    }
                ]
            }
        }
        self.workflow.save()

        # Matching context should trigger
        context_match = {
            'event_type': 'spreadsheet.uploaded',
            'project_id': self.project.id,
            'file_id': '123',
        }

        result = TriggerExecutionService.execute_workflow_trigger(
            workflow_id=str(self.workflow.id),
            trigger_type='polling',
            trigger_context=context_match,
            user=self.user,
            project=self.project,
        )
        self.assertIsNotNone(result, "Matching conditions should trigger")

        # Non-matching context should be skipped
        context_no_match = {
            'event_type': 'task.created',
            'task_id': 456,
        }

        # Reset rate limit by creating new state
        WorkflowTriggerState.objects.filter(workflow=self.workflow).delete()

        result2 = TriggerExecutionService.execute_workflow_trigger(
            workflow_id=str(self.workflow.id),
            trigger_type='polling',
            trigger_context=context_no_match,
            user=self.user,
            project=self.project,
        )
        self.assertIsNone(result2, "Non-matching conditions should skip")

    def test_instant_filter_evaluation(self):
        """Test instant trigger filter evaluation."""
        # Set up workflow with filters
        self.workflow.trigger_config = {
            'trigger_type': 'instant',
            'instant': {
                'event_types': ['task.created'],
                'webhook_enabled': False,
                'filters': {
                    'project_id': self.project.id,
                    'priority': ['HIGH', 'CRITICAL'],
                }
            }
        }
        self.workflow.save()

        # Matching filter should trigger
        context_match = {
            'event_type': 'task.created',
            'task_id': 123,
            'project_id': self.project.id,
            'priority': 'HIGH',
        }

        result = TriggerExecutionService.execute_workflow_trigger(
            workflow_id=str(self.workflow.id),
            trigger_type='instant',
            trigger_context=context_match,
            user=self.user,
            project=self.project,
        )
        self.assertIsNotNone(result, "Matching filters should trigger")

        # Non-matching filter should skip
        context_no_match = {
            'event_type': 'task.created',
            'task_id': 456,
            'project_id': self.project.id,
            'priority': 'LOW',  # Not in filter list
        }

        # Reset dedup
        WorkflowTriggerState.objects.filter(workflow=self.workflow).delete()

        result2 = TriggerExecutionService.execute_workflow_trigger(
            workflow_id=str(self.workflow.id),
            trigger_type='instant',
            trigger_context=context_no_match,
            user=self.user,
            project=self.project,
        )
        self.assertIsNone(result2, "Non-matching filters should skip")

    def test_trigger_log_created(self):
        """Test that trigger logs are created for all attempts."""
        initial_count = WorkflowTriggerLog.objects.count()

        # Successful trigger
        TriggerExecutionService.execute_workflow_trigger(
            workflow_id=str(self.workflow.id),
            trigger_type='manual',
            trigger_context={'test': 'log'},
            user=self.user,
            project=self.project,
        )

        # Check log created
        self.assertEqual(WorkflowTriggerLog.objects.count(), initial_count + 1)

        log = WorkflowTriggerLog.objects.latest('created_at')
        self.assertEqual(log.workflow, self.workflow)
        self.assertEqual(log.trigger_type, 'manual')
        self.assertEqual(log.status, 'triggered')
        self.assertIsNotNone(log.workflow_run)
        self.assertIsNotNone(log.execution_time_ms)

    def test_trigger_state_updated(self):
        """Test that trigger state is updated after successful trigger."""
        # Execute trigger
        TriggerExecutionService.execute_workflow_trigger(
            workflow_id=str(self.workflow.id),
            trigger_type='instant',
            trigger_context={'test': 'state'},
            user=self.user,
            project=self.project,
        )

        # Check state updated
        state = WorkflowTriggerState.objects.get(workflow=self.workflow)
        self.assertIsNotNone(state.last_successful_trigger)
        self.assertEqual(state.last_trigger_type, 'instant')
        self.assertGreater(state.trigger_count_last_hour, 0)

    def test_nonexistent_workflow_returns_none(self):
        """Test that triggering a non-existent workflow returns None."""
        result = TriggerExecutionService.execute_workflow_trigger(
            workflow_id='00000000-0000-0000-0000-000000000000',
            trigger_type='manual',
            trigger_context={'test': 'fail'},
            user=self.user,
            project=self.project,
        )
        self.assertIsNone(result)

        # Check error log created
        log = WorkflowTriggerLog.objects.latest('created_at')
        self.assertEqual(log.status, 'failed')
        self.assertIn('not found', log.error_message.lower())

    def test_trigger_count_resets_after_hour(self):
        """Test that trigger count resets after an hour."""
        state, _ = WorkflowTriggerState.objects.get_or_create(workflow=self.workflow)

        # Set up expired reset time
        state.trigger_count_last_hour = 50
        state.trigger_count_reset_at = timezone.now() - timedelta(hours=2)
        state.save()

        # Trigger should reset counter
        result = TriggerExecutionService.execute_workflow_trigger(
            workflow_id=str(self.workflow.id),
            trigger_type='manual',
            trigger_context={'test': 'reset'},
            user=self.user,
            project=self.project,
        )
        self.assertIsNotNone(result, "Trigger should succeed after reset")

        # Check counter was reset
        state.refresh_from_db()
        self.assertEqual(state.trigger_count_last_hour, 1, "Counter should be reset to 1")
