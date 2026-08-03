import json
from unittest.mock import patch

import pytest
from django.core.management import call_command

from chat.models import Chat, ChatParticipant, ChatType
from core.models import Organization, Project, ProjectMember


pytestmark = pytest.mark.django_db


def test_prepare_chat_load_test_writes_distinct_user_credentials(tmp_path):
    organization = Organization.objects.create(name='Load Test Org')
    project = Project.objects.create(
        name='Load Test Project',
        organization=organization,
    )
    output = tmp_path / 'users.json'

    with patch(
        'chat.management.commands.prepare_chat_load_test.generate_organization_access_token',
        return_value='organization-token',
    ):
        call_command(
            'prepare_chat_load_test',
            project_id=project.id,
            users=2,
            output=str(output),
        )

    config = json.loads(output.read_text(encoding='utf-8'))
    assert config['project_id'] == project.id
    assert len(config['users']) == 2
    assert len({row['user_id'] for row in config['users']}) == 2
    assert all(row['token'] for row in config['users'])
    assert all(row['organization_token'] == 'organization-token' for row in config['users'])

    chat = Chat.objects.get(id=config['chat_id'], type=ChatType.GROUP)
    assert ChatParticipant.objects.filter(chat=chat, is_active=True).count() == 2
    assert ProjectMember.objects.filter(
        project=project,
        is_active=True,
        user__email__startswith='med278-chat-load-',
    ).count() == 2
