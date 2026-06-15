"""
Test script for Phase 5: Trigger Visualization & Monitoring
Creates workflows with different trigger types for testing the UI.
"""
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from agent.models import AgentWorkflowDefinition, AgentWorkflowStep, WorkflowTriggerState
from core.models import Project
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta

User = get_user_model()

def setup_phase5_test_data():
    """Create test workflows with all 4 trigger types."""

    user = User.objects.filter(is_active=True).first()
    project = Project.objects.filter(is_deleted=False).first()

    if not user or not project:
        print("❌ No user or project found.")
        return

    # Delete existing test workflows
    AgentWorkflowDefinition.objects.filter(
        name__startswith="[Phase5 Test]"
    ).delete()

    workflows = []

    # 1. Manual Trigger Workflow
    print("\n📝 Creating Manual Trigger Workflow...")
    manual_wf = AgentWorkflowDefinition.objects.create(
        name="[Phase5 Test] Manual Trigger",
        description="Click the Run button in the hover card to execute this workflow",
        project=project,
        created_by=user,
        status='active',
        trigger_enabled=True,
        trigger_config={'trigger_type': 'manual'}
    )
    AgentWorkflowStep.objects.create(
        workflow=manual_wf,
        name="Log Message",
        step_type="log",
        order=1,
        config={"message": "Manual trigger executed!"}
    )
    workflows.append(("Manual", manual_wf))

    # 2. Polling Trigger Workflow
    print("🔄 Creating Polling Trigger Workflow...")
    polling_wf = AgentWorkflowDefinition.objects.create(
        name="[Phase5 Test] Polling Trigger",
        description="Checks for changes every 5 minutes",
        project=project,
        created_by=user,
        status='active',
        trigger_enabled=True,
        trigger_config={
            'trigger_type': 'polling',
            'polling': {
                'interval_minutes': 5,
                'data_source': 'spreadsheet',
                'spreadsheet_id': 'test-123'
            }
        }
    )
    AgentWorkflowStep.objects.create(
        workflow=polling_wf,
        name="Check Data",
        step_type="spreadsheet",
        order=1,
        config={"action": "read"}
    )
    # Create trigger state with last polling check
    WorkflowTriggerState.objects.create(
        workflow=polling_wf,
        last_polling_check=timezone.now() - timedelta(minutes=2)
    )
    workflows.append(("Polling", polling_wf))

    # 3. Instant Trigger Workflow (Webhook)
    print("⚡ Creating Instant Trigger Workflow...")
    instant_wf = AgentWorkflowDefinition.objects.create(
        name="[Phase5 Test] Instant Trigger",
        description="Triggered instantly via webhook",
        project=project,
        created_by=user,
        status='active',
        trigger_enabled=True,
        trigger_config={
            'trigger_type': 'instant',
            'instant': {
                'webhook_url': f'/api/agent/webhooks/{str(project.id)}/',
                'secret_key': 'test-secret-key-12345'
            }
        }
    )
    AgentWorkflowStep.objects.create(
        workflow=instant_wf,
        name="Process Webhook",
        step_type="log",
        order=1,
        config={"message": "Webhook received!"}
    )
    workflows.append(("Instant", instant_wf))

    # 4. Scheduled Trigger Workflow (Cron)
    print("📅 Creating Scheduled Trigger Workflow...")
    scheduled_wf = AgentWorkflowDefinition.objects.create(
        name="[Phase5 Test] Scheduled Trigger",
        description="Runs every Monday at 9:00 AM",
        project=project,
        created_by=user,
        status='active',
        trigger_enabled=True,
        trigger_config={
            'trigger_type': 'scheduled',
            'scheduled': {
                'cron_expression': '0 9 * * 1',  # Every Monday 9am
                'timezone': 'UTC'
            }
        }
    )
    AgentWorkflowStep.objects.create(
        workflow=scheduled_wf,
        name="Weekly Report",
        step_type="log",
        order=1,
        config={"message": "Weekly scheduled task executed!"}
    )
    # Create trigger state with next scheduled run (example: next Monday 9am)
    next_monday = timezone.now() + timedelta(days=(7 - timezone.now().weekday()))
    next_run = next_monday.replace(hour=9, minute=0, second=0, microsecond=0)
    WorkflowTriggerState.objects.create(
        workflow=scheduled_wf,
        next_scheduled_run=next_run
    )
    workflows.append(("Scheduled", scheduled_wf))

    # Print summary
    print("\n" + "="*60)
    print("✅ Phase 5 Test Data Created Successfully!")
    print("="*60)

    for trigger_type, wf in workflows:
        print(f"\n{trigger_type} Trigger:")
        print(f"  Name: {wf.name}")
        print(f"  ID: {wf.id}")
        print(f"  Status: {wf.status}")
        print(f"  Config: {wf.trigger_config}")

    print("\n" + "="*60)
    print("📍 Testing Instructions:")
    print("="*60)

    print("\n1️⃣ Test TriggerVisualizer (on workflow cards):")
    print("   - Go to: http://localhost/workflows")
    print("   - Look for workflows starting with '[Phase5 Test]'")
    print("   - Each card should show a different trigger status:")
    print("     • Manual: 🤚 'Ready to run' icon")
    print("     • Polling: 🕐 'Next check: in 3 minutes'")
    print("     • Instant: ⚡'Listening for events'")
    print("     • Scheduled: 📅 'Next run: [date]'")

    print("\n2️⃣ Test Manual Trigger Run Button:")
    print("   - Hover over '[Phase5 Test] Manual Trigger' card")
    print("   - Click the blue '▶ Run' button in the hover card footer")
    print("   - Should see: 'Workflow started successfully' toast")

    print("\n3️⃣ Test Trigger Badges:")
    print("   - Each test workflow card should have a trigger badge:")
    print("     • Manual: 🤚 Manual (gray)")
    print("     • Polling: 🕐 Polling (blue)")
    print("     • Instant: ⚡ Instant (orange)")
    print("     • Scheduled: 📅 Scheduled (purple)")

    print("\n4️⃣ Test Trigger Configuration:")
    print("   - Click any workflow to open the canvas editor")
    print("   - Click the '⚡ Triggers' button at the bottom toolbar")
    print("   - You should see the trigger configuration panel")

    print("\n5️⃣ Test Trigger Dashboard (Advanced):")
    print("   - Currently not integrated into UI")
    print("   - Component exists at: frontend/src/components/workflows/agent/triggers/TriggerDashboard.tsx")
    print("   - Can be added to a dedicated monitoring page")

    print("\n" + "="*60)

if __name__ == '__main__':
    setup_phase5_test_data()
