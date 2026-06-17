"""Create a test workflow for trigger configuration verification."""
import os
import sys
import django

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.contrib.auth import get_user_model
from agent.models import AgentWorkflowDefinition

User = get_user_model()
user = User.objects.first()

# Create test workflow
workflow = AgentWorkflowDefinition.objects.create(
    name='Test Trigger Config Workflow',
    description='Test workflow to verify trigger configuration UI',
    created_by=user,
    status='draft',
    trigger_enabled=False,
)

print(f'\n✅ Created test workflow!')
print(f'Workflow ID: {workflow.id}')
print(f'\n📍 Direct URL: http://localhost/workflows/{workflow.id}')
print(f'\n👉 Open this URL in your browser to see the Trigger Configuration section at the bottom')
