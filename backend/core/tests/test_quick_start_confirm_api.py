"""API tests for Quick Start confirm endpoint (qs-3.1 / qs-3.2)."""

import pytest
from django.urls import reverse
from rest_framework import status

from calendars.models import Event
from core.services.quick_start.validation import validate_and_normalize_blueprint
from core.tests.test_quick_start_llm import DEFAULT_MODULES, SAMPLE_LLM_PAYLOAD
from decision.models import Decision
from miro.models import Board
from spreadsheet.models import Spreadsheet
from task.models import Task

CONFIRM_URL = 'quick-start-confirm'


def _confirm_payload(**overrides):
    blueprint = validate_and_normalize_blueprint(SAMPLE_LLM_PAYLOAD, DEFAULT_MODULES)
    base = {
        'blueprint': blueprint,
        'selected_modules': DEFAULT_MODULES,
    }
    base.update(overrides)
    return base


@pytest.mark.django_db
class TestQuickStartConfirmAPI:
    def test_requires_authentication(self, api_client):
        response = api_client.post(reverse(CONFIRM_URL), _confirm_payload(), format='json')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_confirm_creates_project_and_artifacts(self, authenticated_client):
        response = authenticated_client.post(
            reverse(CONFIRM_URL),
            _confirm_payload(),
            format='json',
        )

        assert response.status_code == status.HTTP_201_CREATED
        project_id = response.data['project']['id']
        assert response.data['project']['name'] == 'Q1 Meta Launch'
        assert response.data['project']['is_active'] is True
        assert len(response.data['created']['task_ids']) >= 5
        assert len(response.data['created']['spreadsheet_ids']) == 1
        assert len(response.data['created']['calendar_event_ids']) >= 1
        assert response.data['summary']['tasks'] >= 5

        assert Task.objects.filter(project_id=project_id).count() >= 5
        assert Spreadsheet.objects.filter(project_id=project_id).count() == 1

    def test_project_title_override(self, authenticated_client):
        payload = _confirm_payload(project_title='Custom Confirm Title')
        response = authenticated_client.post(reverse(CONFIRM_URL), payload, format='json')

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['project']['name'] == 'Custom Confirm Title'

    def test_invalid_blueprint_version(self, authenticated_client):
        blueprint = validate_and_normalize_blueprint(SAMPLE_LLM_PAYLOAD, DEFAULT_MODULES)
        blueprint['version'] = 2
        response = authenticated_client.post(
            reverse(CONFIRM_URL),
            {'blueprint': blueprint, 'selected_modules': DEFAULT_MODULES},
            format='json',
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_module_toggle_tasks_disabled(self, authenticated_client):
        modules = {**DEFAULT_MODULES, 'tasks': False}
        response = authenticated_client.post(
            reverse(CONFIRM_URL),
            _confirm_payload(selected_modules=modules),
            format='json',
        )

        assert response.status_code == status.HTTP_201_CREATED
        project_id = response.data['project']['id']
        assert response.data['created']['task_ids'] == []
        assert Task.objects.filter(project_id=project_id).count() == 0
        assert len(response.data['created']['spreadsheet_ids']) == 1

    def test_module_toggle_calendar_disabled(self, authenticated_client):
        modules = {**DEFAULT_MODULES, 'calendar': False}
        response = authenticated_client.post(
            reverse(CONFIRM_URL),
            _confirm_payload(selected_modules=modules),
            format='json',
        )

        assert response.status_code == status.HTTP_201_CREATED
        project_id = response.data['project']['id']
        assert response.data['created']['calendar_event_ids'] == []
        assert Event.objects.filter(calendar__project_id=project_id).count() == 0

    def test_module_toggle_decisions_enabled(self, authenticated_client):
        payload_data = {
            **SAMPLE_LLM_PAYLOAD,
            'decisions': [
                {'title': 'Budget sign-off', 'description': 'Q2 allocation'},
                {'title': 'Creative testing plan', 'description': 'Top 3 variants'},
            ],
        }
        modules = {**DEFAULT_MODULES, 'decisions': True}
        blueprint = validate_and_normalize_blueprint(payload_data, modules)
        response = authenticated_client.post(
            reverse(CONFIRM_URL),
            {'blueprint': blueprint, 'selected_modules': modules},
            format='json',
        )

        assert response.status_code == status.HTTP_201_CREATED
        project_id = response.data['project']['id']
        assert len(response.data['created']['decision_ids']) == 2
        assert response.data['summary']['decisions'] == 2
        assert Decision.objects.filter(project_id=project_id).count() == 2

    def test_module_toggle_miro_enabled(self, authenticated_client):
        payload_data = {
            **SAMPLE_LLM_PAYLOAD,
            'miro_boards': [
                {
                    'name': 'Launch war room',
                    'sticky_notes': [
                        {'content': 'Week 1: setup & tracking'},
                        {'content': 'Week 2: scale winners'},
                    ],
                }
            ],
        }
        modules = {**DEFAULT_MODULES, 'miro': True}
        blueprint = validate_and_normalize_blueprint(payload_data, modules)
        response = authenticated_client.post(
            reverse(CONFIRM_URL),
            {'blueprint': blueprint, 'selected_modules': modules},
            format='json',
        )

        assert response.status_code == status.HTTP_201_CREATED
        project_id = response.data['project']['id']
        assert len(response.data['created']['miro_board_ids']) == 1
        assert response.data['summary']['miro_boards'] == 1
        assert Board.objects.filter(project_id=project_id).count() == 1
