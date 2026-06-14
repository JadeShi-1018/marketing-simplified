import pytest
from django.core.exceptions import ValidationError
from django.urls import reverse
from rest_framework import status

from csm.services import get_form_options, resolve_queue_for_submission


pytestmark = pytest.mark.django_db


def _support_projects_url(project_id):
    return reverse('support-project-list') + f'?project={project_id}'


def _work_types_url(project_id):
    return reverse('csm-work-type-list') + f'?project={project_id}'


def _response_rows(response):
    data = response.data
    if isinstance(data, dict) and 'results' in data:
        return data['results']
    return data


class TestSupportProjectsStubAPI:
    def test_empty_list_when_no_rows(self, member_client, project):
        response = member_client.get(_support_projects_url(project.id))
        assert response.status_code == status.HTTP_200_OK
        assert _response_rows(response) == []

    def test_returns_non_archived_only(self, member_client, project, support_project, archived_support_project):
        response = member_client.get(_support_projects_url(project.id))
        assert response.status_code == status.HTTP_200_OK
        names = [row['name'] for row in _response_rows(response)]
        assert 'Billing' in names
        assert 'Legacy' not in names

    def test_requires_project_param(self, member_client):
        response = member_client.get(reverse('support-project-list'))
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_non_member_forbidden(self, outsider_client, project):
        response = outsider_client.get(_support_projects_url(project.id))
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_post_creates_support_project(self, member_client, project):
        response = member_client.post(
            _support_projects_url(project.id),
            {'name': 'New'},
            format='json',
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['name'] == 'New'


class TestWorkTypesStubAPI:
    def test_empty_list_when_no_rows(self, member_client, project):
        response = member_client.get(_work_types_url(project.id))
        assert response.status_code == status.HTTP_200_OK
        assert _response_rows(response) == []

    def test_returns_active_only(self, member_client, project, work_type, inactive_work_type):
        response = member_client.get(_work_types_url(project.id))
        assert response.status_code == status.HTTP_200_OK
        names = [row['name'] for row in _response_rows(response)]
        assert 'Incident' in names
        assert 'Retired' not in names

    def test_post_creates_work_type(self, member_client, project):
        response = member_client.post(
            _work_types_url(project.id),
            {'name': 'Bug'},
            format='json',
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['name'] == 'Bug'


class TestFormOptionsService:
    def test_get_form_options_empty(self, project):
        opts = get_form_options(project.id)
        assert opts['support_projects'] == []
        assert opts['work_types'] == []
        assert len(opts['project_members']) >= 1

    def test_get_form_options_with_seed(self, project, support_project, work_type):
        opts = get_form_options(project.id)
        assert opts['support_projects'] == [{'id': support_project.id, 'name': 'Billing'}]
        assert opts['work_types'] == [{'id': work_type.id, 'name': 'Incident'}]


class TestQueueRouting:
    def test_uses_support_project_default_queue(self, project, support_project, csm_queue):
        queue = resolve_queue_for_submission(project.id, support_project_id=support_project.id)
        assert queue.id == csm_queue.id

    def test_falls_back_to_project_queue(self, project, csm_queue):
        queue = resolve_queue_for_submission(project.id)
        assert queue.id == csm_queue.id

    def test_raises_when_no_queue(self, project):
        with pytest.raises(ValidationError) as exc:
            resolve_queue_for_submission(project.id)
        assert 'queue' in exc.value.message_dict
