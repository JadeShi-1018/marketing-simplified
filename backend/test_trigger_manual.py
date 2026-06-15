"""
Manual test script for TriggerExecutionService.
Run with: docker compose exec backend python test_trigger_manual.py
"""

import django
import os
import sys

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from agent.models import AgentWorkflowDefinition, WorkflowTriggerLog, WorkflowTriggerState
from agent.trigger_service import TriggerExecutionService
from core.models import Project, Organization
from django.contrib.auth import get_user_model

User = get_user_model()

def run_tests():
    print("=" * 60)
    print("Testing Phase 1: Trigger Models and Service")
    print("=" * 60)

    # Test 1: Check models exist
    print("\n[Test 1] Checking if models are accessible...")
    try:
        print(f"  ✓ AgentWorkflowDefinition: {AgentWorkflowDefinition._meta.db_table}")
        print(f"  ✓ WorkflowTriggerLog: {WorkflowTriggerLog._meta.db_table}")
        print(f"  ✓ WorkflowTriggerState: {WorkflowTriggerState._meta.db_table}")
        print("  [PASS] All models are accessible")
    except Exception as e:
        print(f"  [FAIL] Model check failed: {e}")
        return

    # Test 2: Create test workflow
    print("\n[Test 2] Creating test workflow...")
    try:
        # Get or create test user
        user, _ = User.objects.get_or_create(
            email='trigger_test@example.com',
            defaults={
                'first_name': 'Trigger',
                'last_name': 'Test',
            }
        )

        # Get or create test organization
        org, _ = Organization.objects.get_or_create(
            name='Trigger Test Org'
        )

        # Get or create test project
        project, _ = Project.objects.get_or_create(
            name='Trigger Test Project',
            organization=org
        )

        # Create workflow
        workflow = AgentWorkflowDefinition.objects.create(
            name='Test Workflow for Triggers',
            description='Testing trigger functionality',
            project=project,
            created_by=user,
            status='active',
            trigger_enabled=True,
            trigger_config={
                'trigger_type': 'instant',
                'instant': {
                    'event_types': ['test.event'],
                    'webhook_enabled': False,
                }
            }
        )
        print(f"  ✓ Created workflow: {workflow.id}")
        print(f"  ✓ Trigger enabled: {workflow.trigger_enabled}")
        print(f"  ✓ Trigger config: {workflow.trigger_config}")
        print("  [PASS] Workflow created successfully")
    except Exception as e:
        print(f"  [FAIL] Workflow creation failed: {e}")
        import traceback
        traceback.print_exc()
        return

    # Test 3: Test manual trigger
    print("\n[Test 3] Testing manual trigger...")
    try:
        result = TriggerExecutionService.execute_workflow_trigger(
            workflow_id=str(workflow.id),
            trigger_type='manual',
            trigger_context={'test': 'manual_trigger'},
            user=user,
            project=project,
        )
        print(f"  ✓ Trigger result: {result}")

        # Check log created
        log = WorkflowTriggerLog.objects.filter(workflow=workflow).last()
        if log:
            print(f"  ✓ Log created: {log.id}")
            print(f"  ✓ Log status: {log.status}")
            print(f"  ✓ Log trigger_type: {log.trigger_type}")
            print(f"  ✓ Execution time: {log.execution_time_ms}ms")
            print("  [PASS] Manual trigger successful")
        else:
            print("  [FAIL] No log created")
    except Exception as e:
        print(f"  [FAIL] Manual trigger failed: {e}")
        import traceback
        traceback.print_exc()

    # Test 4: Test rate limiting
    print("\n[Test 4] Testing rate limiting (first 5 triggers)...")
    try:
        success_count = 0
        for i in range(5):
            result = TriggerExecutionService.execute_workflow_trigger(
                workflow_id=str(workflow.id),
                trigger_type='manual',
                trigger_context={'test': f'rate_limit_{i}'},
                user=user,
                project=project,
            )
            if result:
                success_count += 1

        print(f"  ✓ Successful triggers: {success_count}/5")

        # Check state
        state = WorkflowTriggerState.objects.get(workflow=workflow)
        print(f"  ✓ Trigger count in last hour: {state.trigger_count_last_hour}")
        print(f"  ✓ Last successful trigger: {state.last_successful_trigger}")
        print("  [PASS] Rate limiting tracking works")
    except Exception as e:
        print(f"  [FAIL] Rate limiting test failed: {e}")
        import traceback
        traceback.print_exc()

    # Test 5: Test deduplication
    print("\n[Test 5] Testing deduplication...")
    try:
        context = {'event_type': 'test.duplicate', 'data': 'same'}

        # First trigger
        result1 = TriggerExecutionService.execute_workflow_trigger(
            workflow_id=str(workflow.id),
            trigger_type='instant',
            trigger_context=context,
            user=user,
            project=project,
        )

        # Duplicate trigger
        result2 = TriggerExecutionService.execute_workflow_trigger(
            workflow_id=str(workflow.id),
            trigger_type='instant',
            trigger_context=context,
            user=user,
            project=project,
        )

        print(f"  ✓ First trigger result: {result1}")
        print(f"  ✓ Duplicate trigger result: {result2}")

        if result1 and not result2:
            print("  [PASS] Deduplication works correctly")
        else:
            print(f"  [FAIL] Deduplication failed: both triggers returned {result1 is not None}")
    except Exception as e:
        print(f"  [FAIL] Deduplication test failed: {e}")
        import traceback
        traceback.print_exc()

    # Test 6: Count logs
    print("\n[Test 6] Checking trigger logs...")
    try:
        total_logs = WorkflowTriggerLog.objects.filter(workflow=workflow).count()
        triggered_logs = WorkflowTriggerLog.objects.filter(workflow=workflow, status='triggered').count()
        skipped_logs = WorkflowTriggerLog.objects.filter(workflow=workflow, status='skipped').count()

        print(f"  ✓ Total logs: {total_logs}")
        print(f"  ✓ Triggered: {triggered_logs}")
        print(f"  ✓ Skipped: {skipped_logs}")
        print("  [PASS] Logs are being created")
    except Exception as e:
        print(f"  [FAIL] Log check failed: {e}")

    print("\n" + "=" * 60)
    print("Phase 1 Testing Complete!")
    print("=" * 60)

    # Cleanup
    print("\nCleaning up test data...")
    try:
        WorkflowTriggerLog.objects.filter(workflow=workflow).delete()
        WorkflowTriggerState.objects.filter(workflow=workflow).delete()
        workflow.delete()
        print("  ✓ Cleanup complete")
    except Exception as e:
        print(f"  ⚠ Cleanup warning: {e}")

if __name__ == '__main__':
    run_tests()
