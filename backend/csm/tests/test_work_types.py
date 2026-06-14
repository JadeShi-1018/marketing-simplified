import pytest
from django.urls import reverse
from rest_framework import status

from csm.models import CsmWorkType


pytestmark = pytest.mark.django_db


def _list_url(project_id, **params):
    query = f'?project={project_id}'
    for key, value in params.items():
        query += f'&{key}={value}'
    return reverse('csm-work-type-list') + query


def _detail_url(pk):
    return reverse('csm-work-type-detail', kwargs={'pk': pk})


def _reorder_url(project_id):
    return reverse('csm-work-type-reorder') + f'?project={project_id}'


def _response_rows(response):
    data = response.data
    if isinstance(data, dict) and 'results' in data:
        return data['results']
    return data


class TestWorkTypeCRUD:
    def test_create_work_type(self, member_client, project):
        response = member_client.post(
            _list_url(project.id),
            {'name': 'Incident'},
            format='json',
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['name'] == 'Incident'
        assert response.data['is_active'] is True
        assert response.data['sort_order'] == 0

    def test_create_auto_sort_order(self, member_client, project, work_type):
        response = member_client.post(
            _list_url(project.id),
            {'name': 'Request'},
            format='json',
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['sort_order'] == 1

    def test_create_rejects_duplicate_name(self, member_client, project, work_type):
        response = member_client.post(
            _list_url(project.id),
            {'name': 'incident'},
            format='json',
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'name' in response.data

    def test_patch_updates_fields(self, member_client, work_type):
        response = member_client.patch(
            _detail_url(work_type.id),
            {'name': 'Major Incident', 'sort_order': 5},
            format='json',
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data['name'] == 'Major Incident'
        assert response.data['sort_order'] == 5

    def test_delete_deactivates_work_type(self, member_client, project):
        CsmWorkType.objects.create(project=project, name='Incident', sort_order=0)
        second = CsmWorkType.objects.create(project=project, name='Request', sort_order=1)
        response = member_client.delete(_detail_url(second.id))
        assert response.status_code == status.HTTP_200_OK
        assert response.data['is_active'] is False
        second.refresh_from_db()
        assert second.is_active is False

    def test_delete_blocks_last_active_work_type(self, member_client, work_type):
        response = member_client.delete(_detail_url(work_type.id))
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'is_active' in response.data

    def test_list_excludes_inactive_by_default(self, member_client, project, work_type, inactive_work_type):
        response = member_client.get(_list_url(project.id))
        names = [row['name'] for row in _response_rows(response)]
        assert 'Incident' in names
        assert 'Retired' not in names

    def test_list_include_inactive(self, member_client, project, work_type, inactive_work_type):
        response = member_client.get(_list_url(project.id, include_inactive=1))
        names = [row['name'] for row in _response_rows(response)]
        assert 'Incident' in names
        assert 'Retired' in names

    def test_reorder_work_types(self, member_client, project):
        wt1 = CsmWorkType.objects.create(project=project, name='A', sort_order=0)
        wt2 = CsmWorkType.objects.create(project=project, name='B', sort_order=1)
        wt3 = CsmWorkType.objects.create(project=project, name='C', sort_order=2)

        response = member_client.put(
            _reorder_url(project.id),
            {'ids': [wt3.id, wt1.id, wt2.id]},
            format='json',
        )
        assert response.status_code == status.HTTP_200_OK
        order = [row['id'] for row in response.data]
        assert order == [wt3.id, wt1.id, wt2.id]

        wt1.refresh_from_db()
        wt2.refresh_from_db()
        wt3.refresh_from_db()
        assert wt3.sort_order == 0
        assert wt1.sort_order == 1
        assert wt2.sort_order == 2

    def test_non_member_forbidden(self, outsider_client, project):
        response = outsider_client.post(
            _list_url(project.id),
            {'name': 'Blocked'},
            format='json',
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
