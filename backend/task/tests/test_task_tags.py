import pytest
from django.urls import reverse
from rest_framework import status

from task.models import Task


@pytest.mark.django_db
class TestTaskTags:
    def test_create_draft_task_with_tags(self, authenticated_client, project, user):
        user.active_project = project
        user.save(update_fields=['active_project'])

        tags = [{'name': 'Marketing', 'color': '#9B51E0'}]
        url_tasks = reverse('task-list')
        created = authenticated_client.post(
            url_tasks,
            {
                'summary': 'Ship feature',
                'type': 'asset',
                'project_id': project.id,
                'create_as_draft': True,
                'tags': tags,
            },
            format='json',
        )
        assert created.status_code == status.HTTP_201_CREATED
        assert created.data['tags'] == tags

    def test_patch_task_updates_tags(self, authenticated_client, project, user):
        user.active_project = project
        user.save(update_fields=['active_project'])

        task = Task.objects.create(summary='A', type='asset', project=project, owner=user)
        next_tags = [
            {'name': 'Q1', 'color': '#F2C94C'},
            {'name': 'Urgent', 'color': '#EB5757'},
        ]

        detail = reverse('task-detail', kwargs={'pk': task.pk})
        patched = authenticated_client.patch(detail, {'tags': next_tags}, format='json')
        assert patched.status_code == status.HTTP_200_OK
        assert patched.data['tags'] == next_tags

    def test_invalid_tag_color_rejected(self, authenticated_client, project, user):
        user.active_project = project
        user.save(update_fields=['active_project'])

        task = Task.objects.create(summary='B', type='asset', project=project, owner=user)
        detail = reverse('task-detail', kwargs={'pk': task.pk})
        bad = authenticated_client.patch(
            detail,
            {'tags': [{'name': 'x', 'color': '#00000G'}]},
            format='json',
        )
        assert bad.status_code == status.HTTP_400_BAD_REQUEST

    def test_custom_tag_color_allowed(self, authenticated_client, project, user):
        user.active_project = project
        user.save(update_fields=['active_project'])

        task = Task.objects.create(summary='Custom color', type='asset', project=project, owner=user)
        detail = reverse('task-detail', kwargs={'pk': task.pk})
        patched = authenticated_client.patch(
            detail,
            {'tags': [{'name': 'Custom', 'color': '#123abc'}]},
            format='json',
        )

        assert patched.status_code == status.HTTP_200_OK
        assert patched.data['tags'] == [{'name': 'Custom', 'color': '#123ABC'}]

    def test_get_detail_returns_tags_for_ui_echo(self, authenticated_client, project, user):
        """GET /api/tasks/:id/ must expose tags so the detail page can render them."""
        user.active_project = project
        user.save(update_fields=['active_project'])

        task = Task.objects.create(
            summary='Echo',
            type='asset',
            project=project,
            owner=user,
            tags=[{'name': 'Frontend', 'color': '#26b5ce'}],
        )
        detail = reverse('task-detail', kwargs={'pk': task.pk})
        r = authenticated_client.get(detail)
        assert r.status_code == status.HTTP_200_OK
        assert 'tags' in r.data
        assert r.data['tags'] == [{'name': 'Frontend', 'color': '#26B5CE'}]

    def test_list_includes_tags(self, authenticated_client, project, user):
        user.active_project = project
        user.save(update_fields=['active_project'])

        Task.objects.create(
            summary='Listed',
            type='asset',
            project=project,
            owner=user,
            tags=[{'name': 'Beta', 'color': '#26B5CE'}],
        )
        url = reverse('task-list')
        r = authenticated_client.get(url)
        assert r.status_code == status.HTTP_200_OK
        rows = r.data['results'] if isinstance(r.data, dict) and 'results' in r.data else r.data
        tagged = next(item for item in rows if item['summary'] == 'Listed')
        assert tagged['tags'] == [{'name': 'Beta', 'color': '#26B5CE'}]

    def test_delete_tag_catalog_removes_tag_from_project_tasks(self, authenticated_client, project, user):
        user.active_project = project
        user.save(update_fields=['active_project'])

        first = Task.objects.create(
            summary='First tagged',
            type='asset',
            project=project,
            owner=user,
            tags=[
                {'name': 'Launch', 'color': '#123ABC'},
                {'name': 'Keep', 'color': '#26B5CE'},
            ],
        )
        second = Task.objects.create(
            summary='Second tagged',
            type='asset',
            project=project,
            owner=user,
            tags=[{'name': 'launch', 'color': '#EB5757'}],
        )

        url = reverse('task-tag-catalog')
        deleted = authenticated_client.delete(
            f'{url}?project_id={project.id}&name=Launch',
            format='json',
        )

        assert deleted.status_code == status.HTTP_200_OK
        assert deleted.data['updated_tasks'] == 2

        first = Task.objects.get(pk=first.pk)
        second = Task.objects.get(pk=second.pk)
        assert first.tags == [{'name': 'Keep', 'color': '#26B5CE'}]
        assert second.tags == []

    def test_reject_more_than_ten_tags(self, authenticated_client, project, user):
        user.active_project = project
        user.save(update_fields=['active_project'])

        tags = [
            {'name': f'Tag{i}', 'color': '#26B5CE'}
            for i in range(1, 12)
        ]
        url_tasks = reverse('task-list')
        created = authenticated_client.post(
            url_tasks,
            {
                'summary': 'Too many tags',
                'type': 'asset',
                'project_id': project.id,
                'create_as_draft': True,
                'tags': tags,
            },
            format='json',
        )

        assert created.status_code == status.HTTP_400_BAD_REQUEST
        assert 'tags' in created.data

    def test_reject_tag_name_longer_than_fifteen(self, authenticated_client, project, user):
        user.active_project = project
        user.save(update_fields=['active_project'])

        task = Task.objects.create(summary='Long tag', type='asset', project=project, owner=user)
        detail = reverse('task-detail', kwargs={'pk': task.pk})
        patched = authenticated_client.patch(
            detail,
            {'tags': [{'name': '1234567890123456', 'color': '#26B5CE'}]},
            format='json',
        )

        assert patched.status_code == status.HTTP_400_BAD_REQUEST
        assert 'tags' in patched.data
