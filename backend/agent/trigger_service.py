"""
Core service for executing workflow triggers.
Provides a unified interface for all trigger types.
"""

import hashlib
import json
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any

from django.db import transaction
from django.utils import timezone

from .models import (
    AgentWorkflowDefinition,
    AgentWorkflowRun,
    WorkflowTriggerLog,
    WorkflowTriggerState,
)

logger = logging.getLogger(__name__)

# Rate limiting constants
MAX_TRIGGERS_PER_HOUR = 100
DEDUP_WINDOW_MINUTES = 5


class TriggerExecutionService:
    """
    Service for executing workflow triggers.
    Handles rate limiting, deduplication, and error handling.
    """

    @staticmethod
    def execute_workflow_trigger(
        workflow_id: str,
        trigger_type: str,
        trigger_context: Dict[str, Any],
        user=None,
        project=None,
    ) -> Optional[str]:
        """
        Execute a workflow trigger.

        Args:
            workflow_id: UUID of the workflow to trigger
            trigger_type: 'polling', 'instant', 'scheduled', 'manual'
            trigger_context: Context about what caused the trigger
            user: User who triggered (for manual triggers)
            project: Project context

        Returns:
            workflow_run_id if successful, None if skipped/failed
        """
        start_time = timezone.now()
        workflow_run_id = None
        status = 'failed'
        error_message = None

        try:
            # 1. Load workflow
            workflow = AgentWorkflowDefinition.objects.select_related('project').get(
                id=workflow_id,
                is_deleted=False,
            )

            # 2. Check if triggers are enabled
            if not workflow.trigger_enabled and trigger_type != 'manual':
                logger.info(f"Triggers disabled for workflow {workflow.name}")
                status = 'skipped'
                return None

            # 3. Rate limiting check
            if not TriggerExecutionService._check_rate_limit(workflow):
                logger.warning(f"Rate limit exceeded for workflow {workflow.name}")
                status = 'skipped'
                error_message = "Rate limit exceeded (max 100 triggers/hour)"
                return None

            # 4. Deduplication check (for non-manual triggers)
            if trigger_type != 'manual':
                if TriggerExecutionService._is_duplicate_trigger(workflow, trigger_context):
                    logger.info(f"Duplicate trigger detected for workflow {workflow.name}")
                    status = 'skipped'
                    error_message = "Duplicate trigger within deduplication window"
                    return None

            # 5. Evaluate trigger conditions
            if not TriggerExecutionService._evaluate_conditions(workflow, trigger_context):
                logger.info(f"Trigger conditions not met for workflow {workflow.name}")
                status = 'skipped'
                error_message = "Trigger conditions not satisfied"
                return None

            # 6. Create agent session
            from .models import AgentSession
            session = AgentSession.objects.create(
                user=user or workflow.created_by,
                project=project or workflow.project,
                title=f"Auto-triggered: {workflow.name}",
                approval_required=False,  # Auto-triggered workflows bypass approval
            )

            # 7. Execute workflow through orchestrator
            from .services import AgentOrchestrator
            orchestrator = AgentOrchestrator(
                user=user or workflow.created_by,
                project=project or workflow.project,
                session=session,
            )

            # TODO: For now, execute synchronously
            # In future, make async via Celery for polling/scheduled triggers
            # workflow_run = orchestrator.execute_workflow(
            #     workflow_id=workflow_id,
            #     context=trigger_context,
            # )

            # For now, just create a workflow run placeholder
            workflow_run = AgentWorkflowRun.objects.create(
                session=session,
                workflow_definition=workflow,
                status='analyzing',
            )

            workflow_run_id = str(workflow_run.id)
            status = 'triggered'

            # 8. Update trigger state
            TriggerExecutionService._update_trigger_state(
                workflow,
                trigger_type,
                trigger_context,
            )

            logger.info(f"Workflow {workflow.name} triggered successfully: {workflow_run_id}")
            return workflow_run_id

        except AgentWorkflowDefinition.DoesNotExist:
            error_message = f"Workflow {workflow_id} not found"
            logger.error(error_message)
        except Exception as e:
            error_message = str(e)
            logger.exception(f"Error executing workflow trigger: {e}")
        finally:
            # Always log the trigger attempt
            execution_time_ms = int((timezone.now() - start_time).total_seconds() * 1000)
            TriggerExecutionService._create_trigger_log(
                workflow_id=workflow_id,
                trigger_type=trigger_type,
                status=status,
                trigger_context=trigger_context,
                workflow_run_id=workflow_run_id,
                error_message=error_message,
                execution_time_ms=execution_time_ms,
            )

        return workflow_run_id

    @staticmethod
    def _check_rate_limit(workflow: AgentWorkflowDefinition) -> bool:
        """Check if workflow has exceeded trigger rate limit."""
        state, _ = WorkflowTriggerState.objects.get_or_create(workflow=workflow)

        now = timezone.now()
        reset_time = state.trigger_count_reset_at or now

        # Reset counter if hour has passed
        if now >= reset_time:
            state.trigger_count_last_hour = 0
            state.trigger_count_reset_at = now + timedelta(hours=1)

        if state.trigger_count_last_hour >= MAX_TRIGGERS_PER_HOUR:
            return False

        state.trigger_count_last_hour += 1
        state.save()
        return True

    @staticmethod
    def _is_duplicate_trigger(
        workflow: AgentWorkflowDefinition,
        trigger_context: Dict[str, Any],
    ) -> bool:
        """
        Check if this trigger is a duplicate within the deduplication window.
        Uses content hash of trigger_context for comparison.
        """
        state, _ = WorkflowTriggerState.objects.get_or_create(workflow=workflow)

        # Compute hash of trigger context (exclude timestamps)
        context_copy = trigger_context.copy()
        context_copy.pop('timestamp', None)
        context_copy.pop('triggered_at', None)
        context_hash = hashlib.sha256(
            json.dumps(context_copy, sort_keys=True).encode()
        ).hexdigest()

        # Check if same hash was seen recently
        if state.last_checked_data_hash == context_hash:
            # Check if within deduplication window
            if state.last_polling_check:
                time_since_last = timezone.now() - state.last_polling_check
                if time_since_last < timedelta(minutes=DEDUP_WINDOW_MINUTES):
                    return True

        # Update state with new hash
        state.last_checked_data_hash = context_hash
        state.last_polling_check = timezone.now()
        state.save()

        return False

    @staticmethod
    def _evaluate_conditions(
        workflow: AgentWorkflowDefinition,
        trigger_context: Dict[str, Any],
    ) -> bool:
        """
        Evaluate trigger conditions based on workflow config.
        Returns True if all conditions are met.
        """
        trigger_config = workflow.trigger_config or {}
        trigger_type = trigger_config.get('trigger_type', 'manual')

        if trigger_type == 'manual':
            return True  # Manual triggers always pass

        if trigger_type == 'polling':
            conditions = trigger_config.get('polling', {}).get('conditions', [])
            return TriggerExecutionService._evaluate_polling_conditions(
                conditions,
                trigger_context,
            )

        if trigger_type == 'instant':
            filters = trigger_config.get('instant', {}).get('filters', {})
            return TriggerExecutionService._evaluate_instant_filters(
                filters,
                trigger_context,
            )

        if trigger_type == 'scheduled':
            # Scheduled triggers always execute when time arrives
            return True

        return False

    # External service event types produced by PollingHandler
    _EXTERNAL_POLLING_EVENTS = frozenset({
        'zoom.recording_ready',
        'google_sheets.modified',
        'linear.issue_updated',
        'notion.page_updated',
    })

    @staticmethod
    def _evaluate_polling_conditions(
        conditions: list,
        trigger_context: Dict[str, Any],
    ) -> bool:
        """
        Evaluate polling trigger conditions.

        Polling now monitors external services (Zoom, Google Sheets, Linear, Notion).
        The handler already verifies a change exists before calling execute_workflow_trigger,
        so external service events always pass here.  An empty conditions list also
        passes unconditionally (the common case for all new polling configs).
        """
        if not conditions:
            return True  # No conditions = always trigger

        # External service events: the handler already confirmed the change
        event_type = trigger_context.get('event_type', '')
        if event_type in TriggerExecutionService._EXTERNAL_POLLING_EVENTS:
            return True

        return False

    @staticmethod
    def _evaluate_instant_filters(
        filters: Dict[str, Any],
        trigger_context: Dict[str, Any],
    ) -> bool:
        """Evaluate instant trigger filters."""
        if not filters:
            return True  # No filters = always trigger

        # All filters must match (AND logic)
        for key, expected_value in filters.items():
            actual_value = trigger_context.get(key)

            if isinstance(expected_value, list):
                if actual_value not in expected_value:
                    return False
            else:
                if actual_value != expected_value:
                    return False

        return True

    @staticmethod
    def _update_trigger_state(
        workflow: AgentWorkflowDefinition,
        trigger_type: str,
        trigger_context: Dict[str, Any],
    ):
        """Update workflow trigger state after successful execution."""
        state, _ = WorkflowTriggerState.objects.get_or_create(workflow=workflow)
        state.last_successful_trigger = timezone.now()
        state.last_trigger_type = trigger_type

        # Update next scheduled run for scheduled triggers
        if trigger_type == 'scheduled':
            cron_expr = workflow.trigger_config.get('scheduled', {}).get('cron_expression')
            if cron_expr:
                try:
                    from croniter import croniter
                    iter = croniter(cron_expr, timezone.now())
                    state.next_scheduled_run = iter.get_next(datetime)
                except Exception:
                    logger.exception(f"Invalid cron expression: {cron_expr}")
                    state.next_scheduled_run = timezone.now() + timedelta(days=1)

        state.save()

    @staticmethod
    def _create_trigger_log(
        workflow_id: str,
        trigger_type: str,
        status: str,
        trigger_context: Dict[str, Any],
        workflow_run_id: Optional[str],
        error_message: Optional[str],
        execution_time_ms: int,
    ):
        """Create a trigger log entry for audit and debugging."""
        try:
            WorkflowTriggerLog.objects.create(
                workflow_id=workflow_id,
                trigger_type=trigger_type,
                status=status,
                trigger_context=trigger_context,
                workflow_run_id=workflow_run_id,
                error_message=error_message,
                execution_time_ms=execution_time_ms,
            )
        except Exception:
            logger.exception("Failed to create trigger log")
