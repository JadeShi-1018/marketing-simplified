import pytest
from django.urls import reverse
from rest_framework import status

from csm.models import TicketForm, TicketFormField, TicketFormAssignment
from experience_group.models import ExperienceGroup


pytestmark = pytest.mark.django_db


def _response_rows(response):
    data = response.data
    if isinstance(data, dict) and 'results' in data:
        return data['results']
    return data


def _list_url(project_id):
    return reverse('ticket-form-list') + f'?project={project_id}'


def _detail_url(form_id):
    return reverse('ticket-form-detail', kwargs={'pk': form_id})


def _fields_url(form_id):
    return reverse('ticket-form-bulk-fields', kwargs={'pk': form_id})


def _set_default_url(form_id):
    return reverse('ticket-form-set-default', kwargs={'pk': form_id})


def _assignments_url(form_id):
    return reverse('ticket-form-assignments', kwargs={'pk': form_id})


def _base_system_fields():
    return [
        {'field_key': 'summary', 'label': 'Summary', 'field_type': 'system_summary', 'sort_order': 0, 'is_required': True},
        {'field_key': 'description', 'label': 'Description', 'field_type': 'system_description', 'sort_order': 1, 'is_required': True},
        {'field_key': 'project', 'label': 'Project', 'field_type': 'system_project', 'sort_order': 2, 'is_required': True},
        {'field_key': 'work_type', 'label': 'Work Type', 'field_type': 'system_work_type', 'sort_order': 3, 'is_required': True},
    ]


class TestTicketFormCRUD:
    def test_create_seeds_four_system_fields(self, member_client, project):
        response = member_client.post(
            _list_url(project.id),
            {'name': 'Default', 'description': 'Main form'},
            format='json',
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert len(response.data['fields']) == 4
        form = TicketForm.objects.get(pk=response.data['id'])
        assert form.fields.count() == 4
        keys = set(form.fields.values_list('field_key', flat=True))
        assert keys == TicketFormField.SYSTEM_FIELD_KEYS

    def test_list_requires_project(self, member_client):
        response = member_client.get(reverse('ticket-form-list'))
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_list_returns_forms_for_project(self, member_client, project):
        TicketForm.objects.create(project=project, name='A')
        response = member_client.get(_list_url(project.id))
        assert response.status_code == status.HTTP_200_OK
        names = [row['name'] for row in _response_rows(response)]
        assert 'A' in names

    def test_non_member_gets_403(self, outsider_client, project):
        response = outsider_client.get(_list_url(project.id))
        assert response.status_code == status.HTTP_403_FORBIDDEN


class TestBulkFields:
    def test_put_fields_accepts_custom_field(self, member_client, project):
        form = TicketForm.objects.create(project=project, name='F1')
        from csm.services import ensure_system_fields
        ensure_system_fields(form)

        payload = {'fields': _base_system_fields() + [
            {'field_key': 'account_id', 'label': 'Account ID', 'field_type': 'short_text', 'sort_order': 4, 'is_required': False},
        ]}
        response = member_client.put(_fields_url(form.id), payload, format='json')
        assert response.status_code == status.HTTP_200_OK
        assert form.fields.filter(field_key='account_id').exists()

    def test_rejects_missing_system_field(self, member_client, project):
        form = TicketForm.objects.create(project=project, name='F1')
        from csm.services import ensure_system_fields
        ensure_system_fields(form)

        payload = {'fields': _base_system_fields()[1:]}
        response = member_client.put(_fields_url(form.id), payload, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_rejects_duplicate_field_labels(self, member_client, project):
        form = TicketForm.objects.create(project=project, name='F1')
        from csm.services import ensure_system_fields
        ensure_system_fields(form)

        payload = {'fields': _base_system_fields() + [
            {'field_key': 'account_id', 'label': 'Account ID', 'field_type': 'short_text', 'sort_order': 4, 'is_required': False},
            {'field_key': 'account_id_2', 'label': 'account id', 'field_type': 'short_text', 'sort_order': 5, 'is_required': False},
        ]}
        response = member_client.put(_fields_url(form.id), payload, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_rejects_dropdown_without_options(self, member_client, project):
        form = TicketForm.objects.create(project=project, name='F1')
        from csm.services import ensure_system_fields
        ensure_system_fields(form)

        payload = {'fields': _base_system_fields() + [
            {'field_key': 'priority', 'label': 'Priority', 'field_type': 'dropdown', 'sort_order': 4, 'is_required': False, 'options': []},
        ]}
        response = member_client.put(_fields_url(form.id), payload, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_accepts_dropdown_with_options(self, member_client, project):
        form = TicketForm.objects.create(project=project, name='F1')
        from csm.services import ensure_system_fields
        ensure_system_fields(form)

        payload = {'fields': _base_system_fields() + [
            {
                'field_key': 'priority',
                'label': 'Priority',
                'field_type': 'dropdown',
                'sort_order': 4,
                'is_required': False,
                'options': [{'value': 'high', 'label': 'High'}, {'value': 'low', 'label': 'Low'}],
            },
            {
                'field_key': 'features',
                'label': 'Features',
                'field_type': 'checkbox',
                'sort_order': 5,
                'is_required': False,
                'options': [{'value': 'a', 'label': 'A'}],
            },
        ]}
        response = member_client.put(_fields_url(form.id), payload, format='json')
        assert response.status_code == status.HTTP_200_OK
        assert form.fields.filter(field_key='priority', field_type='dropdown').exists()
        priority = form.fields.get(field_key='priority')
        assert len(priority.options) == 2


class TestDefaultForm:
    def test_only_one_default_per_project(self, member_client, project):
        f1 = TicketForm.objects.create(project=project, name='F1', is_default=True)
        f2 = TicketForm.objects.create(project=project, name='F2')

        response = member_client.post(_set_default_url(f2.id))
        assert response.status_code == status.HTTP_200_OK

        f1.refresh_from_db()
        f2.refresh_from_db()
        assert f1.is_default is False
        assert f2.is_default is True


class TestAssignments:
    def test_eg_assignment_overrides_other_form(self, member_client, project):
        eg = ExperienceGroup.objects.create(project=project, name='VIP')
        f1 = TicketForm.objects.create(project=project, name='Default')
        f2 = TicketForm.objects.create(project=project, name='VIP Form')
        TicketFormAssignment.objects.create(form=f1, experience_group=eg)

        response = member_client.put(
            _assignments_url(f2.id),
            {'experience_group_ids': [eg.id]},
            format='json',
        )
        assert response.status_code == status.HTTP_200_OK
        assert TicketFormAssignment.objects.filter(experience_group=eg).count() == 1
        assert TicketFormAssignment.objects.get(experience_group=eg).form_id == f2.id
