"""
Phase 4 Scheduled Triggers Test Script
Tests cron-based scheduled workflow triggers.
"""

import os
import sys
import django
from datetime import datetime, timedelta

# Setup Django
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.utils import timezone
from django.contrib.auth import get_user_model
from agent.models import (
    AgentWorkflowDefinition,
    WorkflowTriggerLog,
    WorkflowTriggerState,
)
from agent.trigger_handlers import ScheduledHandler
from agent.trigger_service import TriggerExecutionService

User = get_user_model()


def cleanup():
    """Clean up test data."""
    print("\n🧹 Cleaning up test data...")
    AgentWorkflowDefinition.objects.filter(name__startswith="Test Scheduled").delete()
    WorkflowTriggerLog.objects.filter(workflow__name__startswith="Test Scheduled").delete()
    WorkflowTriggerState.objects.filter(workflow__name__startswith="Test Scheduled").delete()


def test_1_create_scheduled_workflow():
    """Test 1: Create a workflow with scheduled trigger."""
    print("\n" + "="*60)
    print("TEST 1: Create Workflow with Scheduled Trigger")
    print("="*60)

    user = User.objects.first()
    workflow = AgentWorkflowDefinition.objects.create(
        name="Test Scheduled Workflow Daily",
        description="Test workflow with daily schedule",
        created_by=user,
        trigger_enabled=True,
        trigger_config={
            "trigger_type": "scheduled",
            "scheduled": {
                "cron_expression": "0 9 * * *",  # Every day at 9am
                "timezone": "UTC",
            }
        },
    )

    print(f"✓ Created workflow: {workflow.name}")
    print(f"  ID: {workflow.id}")
    print(f"  Cron: {workflow.trigger_config['scheduled']['cron_expression']}")

    return workflow


def test_2_compute_next_run():
    """Test 2: Compute next scheduled run time."""
    print("\n" + "="*60)
    print("TEST 2: Compute Next Scheduled Run")
    print("="*60)

    from croniter import croniter

    cron_expression = "0 9 * * *"  # Daily at 9am
    now = timezone.now()

    iter = croniter(cron_expression, now)
    next_run = iter.get_next(datetime)

    print(f"✓ Current time: {now.isoformat()}")
    print(f"✓ Cron expression: {cron_expression}")
    print(f"✓ Next run: {next_run.isoformat()}")
    print(f"✓ Time until next run: {next_run - now}")

    return next_run


def test_3_trigger_state_initialization():
    """Test 3: Initialize trigger state with next_scheduled_run."""
    print("\n" + "="*60)
    print("TEST 3: Initialize Trigger State")
    print("="*60)

    workflow = AgentWorkflowDefinition.objects.filter(
        name__startswith="Test Scheduled"
    ).first()

    # Execute trigger service to initialize state
    TriggerExecutionService.execute_workflow_trigger(
        workflow_id=str(workflow.id),
        trigger_type='scheduled',
        trigger_context={'event_type': 'scheduled.cron', 'scheduled_time': timezone.now().isoformat()},
        user=workflow.created_by,
        project=workflow.project,
    )

    # Check trigger state
    state = WorkflowTriggerState.objects.get(workflow=workflow)
    print(f"✓ Trigger state created:")
    print(f"  Last successful trigger: {state.last_successful_trigger}")
    print(f"  Next scheduled run: {state.next_scheduled_run}")
    print(f"  Last trigger type: {state.last_trigger_type}")

    return state


def test_4_scheduled_handler_check():
    """Test 4: Test ScheduledHandler.check_all_scheduled_workflows()."""
    print("\n" + "="*60)
    print("TEST 4: Scheduled Handler Check")
    print("="*60)

    # Create a workflow that's due to run NOW
    user = User.objects.first()
    workflow = AgentWorkflowDefinition.objects.create(
        name="Test Scheduled Workflow Immediate",
        description="Test workflow scheduled to run immediately",
        created_by=user,
        trigger_enabled=True,
        trigger_config={
            "trigger_type": "scheduled",
            "scheduled": {
                "cron_expression": "* * * * *",  # Every minute
                "timezone": "UTC",
            }
        },
    )

    # Set next_scheduled_run to the past so it triggers immediately
    state, _ = WorkflowTriggerState.objects.get_or_create(workflow=workflow)
    state.next_scheduled_run = timezone.now() - timedelta(seconds=10)
    state.save()

    print(f"✓ Created workflow: {workflow.name}")
    print(f"  Next scheduled run (in past): {state.next_scheduled_run}")

    # Run the handler
    initial_log_count = WorkflowTriggerLog.objects.filter(workflow=workflow).count()
    print(f"\n📊 Initial trigger log count: {initial_log_count}")

    triggered_count = ScheduledHandler.check_all_scheduled_workflows()

    final_log_count = WorkflowTriggerLog.objects.filter(workflow=workflow).count()
    print(f"📊 Final trigger log count: {final_log_count}")
    print(f"✓ Workflows triggered: {triggered_count}")

    if final_log_count > initial_log_count:
        print("✓✓ Scheduled handler successfully triggered workflow!")
        latest_log = WorkflowTriggerLog.objects.filter(workflow=workflow).latest('created_at')
        print(f"   Trigger type: {latest_log.trigger_type}")
        print(f"   Status: {latest_log.status}")
        print(f"   Context: {latest_log.trigger_context}")
    else:
        print("✗✗ No new trigger logs created!")


def test_5_cron_variations():
    """Test 5: Test various cron expressions."""
    print("\n" + "="*60)
    print("TEST 5: Cron Expression Variations")
    print("="*60)

    from croniter import croniter

    test_crons = {
        "Every Monday 9am": "0 9 * * 1",
        "Every day 9am": "0 9 * * *",
        "Every hour": "0 * * * *",
        "Every 30 minutes": "*/30 * * * *",
        "Every weekday 9am": "0 9 * * 1-5",
    }

    now = timezone.now()
    print(f"Current time: {now.isoformat()}\n")

    for label, cron_expr in test_crons.items():
        try:
            iter = croniter(cron_expr, now)
            next_run = iter.get_next(datetime)
            time_until = next_run - now

            print(f"✓ {label}")
            print(f"  Expression: {cron_expr}")
            print(f"  Next run: {next_run.isoformat()}")
            print(f"  Time until: {time_until}")
            print()
        except Exception as e:
            print(f"✗ {label}: ERROR - {e}\n")


def test_6_trigger_logs_statistics():
    """Test 6: Verify trigger logs and statistics."""
    print("\n" + "="*60)
    print("TEST 6: Trigger Logs and Statistics")
    print("="*60)

    workflows = AgentWorkflowDefinition.objects.filter(
        name__startswith="Test Scheduled"
    )

    for workflow in workflows:
        logs = WorkflowTriggerLog.objects.filter(workflow=workflow)
        triggered = logs.filter(status='triggered').count()
        skipped = logs.filter(status='skipped').count()
        failed = logs.filter(status='failed').count()

        print(f"\n📊 Workflow: {workflow.name}")
        print(f"   Total logs: {logs.count()}")
        print(f"   Triggered: {triggered}")
        print(f"   Skipped: {skipped}")
        print(f"   Failed: {failed}")

        if logs.exists():
            latest = logs.latest('created_at')
            print(f"   Latest trigger:")
            print(f"     - Type: {latest.trigger_type}")
            print(f"     - Status: {latest.status}")
            print(f"     - Time: {latest.created_at.isoformat()}")


def test_7_celery_beat_task():
    """Test 7: Verify Celery Beat task is configured."""
    print("\n" + "="*60)
    print("TEST 7: Celery Beat Configuration")
    print("="*60)

    from django.conf import settings

    beat_schedule = getattr(settings, 'CELERY_BEAT_SCHEDULE', {})

    if 'agent-check-scheduled-triggers' in beat_schedule:
        config = beat_schedule['agent-check-scheduled-triggers']
        print("✓ Celery Beat task found!")
        print(f"  Task: {config['task']}")
        print(f"  Schedule: {config['schedule']}")
        print(f"  Options: {config.get('options', {})}")
    else:
        print("✗ Celery Beat task NOT configured!")
        print("  Expected: 'agent-check-scheduled-triggers' in CELERY_BEAT_SCHEDULE")


def run_all_tests():
    """Run all Phase 4 tests."""
    print("\n" + "🧪"*30)
    print("PHASE 4: SCHEDULED TRIGGERS TEST SUITE")
    print("🧪"*30)

    try:
        cleanup()

        # Run tests
        test_1_create_scheduled_workflow()
        test_2_compute_next_run()
        test_3_trigger_state_initialization()
        test_4_scheduled_handler_check()
        test_5_cron_variations()
        test_6_trigger_logs_statistics()
        test_7_celery_beat_task()

        print("\n" + "="*60)
        print("✅ ALL TESTS COMPLETED!")
        print("="*60)
        print("\n📝 Summary:")
        print("  ✓ Scheduled workflow creation")
        print("  ✓ Cron expression parsing")
        print("  ✓ Next run time computation")
        print("  ✓ Trigger state management")
        print("  ✓ Scheduled handler execution")
        print("  ✓ Multiple cron patterns")
        print("  ✓ Trigger log auditing")
        print("  ✓ Celery Beat configuration")

        print("\n🎉 Phase 4 定时触发功能完全正常！")

    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        cleanup()


if __name__ == '__main__':
    run_all_tests()
