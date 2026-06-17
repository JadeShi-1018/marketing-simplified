import pytest
from django.urls import reverse
from rest_framework import status

from csm.models import SupportProject


pytestmark = pytest.mark.django_db


def _list_url(project_id, **params):
    query = f'?project={project_id}'
    for key, value in params.items():
        query += f'&{key}={value}'
    return reverse('support-project-list') + query


def _detail_url(pk):
    return reverse('support-project-detail', kwargs={'pk': pk})


def _response_rows(response):
    data = response.data
    if isinstance(data, dict) and 'results' in data:
        return data['results']
    return data


class TestSupportProjectCRUD:
    def test_create_support_project(self, member_client, project):
        response = member_client.post(
            _list_url(project.id),
            {'name': 'Billing'},
            format='json',
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['name'] == 'Billing'
        assert response.data['is_archived'] is False
        assert SupportProject.objects.filter(project=project, name='Billing').exists()

    def test_create_with_default_queue(self, member_client, project, csm_queue):
        response = member_client.post(
            _list_url(project.id),
            {'name': 'Billing', 'default_queue': csm_queue.id},
            format='json',
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['default_queue'] == csm_queue.id
        assert response.data['default_queue_name'] == csm_queue.name

    def test_create_rejects_duplicate_name_case_insensitive(self, member_client, project, support_project):
        response = member_client.post(
            _list_url(project.id),
            {'name': 'billing'},
            format='json',
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'name' in response.data

    def test_create_rejects_invalid_queue(self, member_client, project, customer_organisation):
        from csm.models import Queue
        other_queue = Queue.objects.create(
            project=None,
            organisation=customer_organisation,
            name='Other',
            is_active=True,
        )
        response = member_client.post(
            _list_url(project.id),
            {'name': 'Ops', 'default_queue': other_queue.id},
            format='json',
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'default_queue' in response.data

    def test_patch_updates_name_and_queue(self, member_client, project, support_project, csm_queue):
        response = member_client.patch(
            _detail_url(support_project.id),
            {'name': 'Billing Ops', 'default_queue': None},
            format='json',
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data['name'] == 'Billing Ops'
        assert response.data['default_queue'] is None

    def test_delete_archives_support_project(self, member_client, support_project):
        response = member_client.delete(_detail_url(support_project.id))
        assert response.status_code == status.HTTP_200_OK
        assert response.data['is_archived'] is True
        support_project.refresh_from_db()
        assert support_project.is_archived is True

    def test_list_excludes_archived_by_default(self, member_client, project, support_project, archived_support_project):
        response = member_client.get(_list_url(project.id))
        names = [row['name'] for row in _response_rows(response)]
        assert 'Billing' in names
        assert 'Legacy' not in names

    def test_list_include_archived(self, member_client, project, support_project, archived_support_project):
        response = member_client.get(_list_url(project.id, include_archived=1))
        names = [row['name'] for row in _response_rows(response)]
        assert 'Billing' in names
        assert 'Legacy' in names

    def test_retrieve_detail(self, member_client, support_project):
        response = member_client.get(_detail_url(support_project.id))
        assert response.status_code == status.HTTP_200_OK
        assert response.data['name'] == 'Billing'

    def test_non_member_forbidden(self, outsider_client, project):
        response = outsider_client.post(
            _list_url(project.id),
            {'name': 'Blocked'},
            format='json',
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
