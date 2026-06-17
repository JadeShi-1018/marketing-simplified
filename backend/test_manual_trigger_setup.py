"""
Test script to create a workflow with manual trigger for testing.
"""
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from agent.models import AgentWorkflowDefinition, AgentWorkflowStep
from core.models import Project
from django.contrib.auth import get_user_model

User = get_user_model()

def create_manual_trigger_workflow():
    """Create a test workflow with manual trigger enabled."""

    # Get first user and project
    user = User.objects.filter(is_active=True).first()
    project = Project.objects.filter(is_deleted=False).first()

    if not user or not project:
        print("❌ No user or project found. Please create them first.")
        return None

    # Create workflow with manual trigger
    workflow = AgentWorkflowDefinition.objects.create(
        name="Manual Trigger Test Workflow",
        description="A test workflow for manual trigger functionality. Click 'Run' to execute.",
        project=project,
        created_by=user,
        status='active',
        is_system=False,
        is_default=False,
        trigger_enabled=True,
        trigger_config={
            'trigger_type': 'manual'
        }
    )

    # Add a simple step
    AgentWorkflowStep.objects.create(
        workflow=workflow,
        name="Log Message",
        step_type="log",
        order=1,
        config={"message": "Manual trigger executed successfully!"},
        description="Logs a message when manually triggered"
    )

    print("\n✅ Manual Trigger Test Workflow Created!")
    print(f"   ID: {workflow.id}")
    print(f"   Name: {workflow.name}")
    print(f"   Status: {workflow.status}")
    print(f"   Trigger Enabled: {workflow.trigger_enabled}")
    print(f"   Trigger Type: {workflow.trigger_config.get('trigger_type')}")
    print(f"   Project: {project.name}")
    print(f"   Created By: {user.email}")
    print("\n📍 Next Steps:")
    print("   1. Go to http://localhost/workflows")
    print("   2. Hover over the 'Manual Trigger Test Workflow' card")
    print("   3. You should see a blue '▶ Run' button in the footer")
    print("   4. Click the Run button to test manual execution")

    return workflow

if __name__ == '__main__':
    workflow = create_manual_trigger_workflow()
