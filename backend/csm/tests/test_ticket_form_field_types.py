"""Tests for Phase 7 custom field types (builder + submit validation)."""

import json

import pytest
from django.urls import reverse
from rest_framework import status

from csm.models import TicketForm, TicketFormField, Ticket
from csm.services import ensure_system_fields

pytestmark = pytest.mark.django_db


def _fields_url(form_id):
    return reverse('ticket-form-bulk-fields', kwargs={'pk': form_id})


def _submit_url(eg_id):
    return reverse('experience-group-submit-request', kwargs={'pk': eg_id})


def _base_system_fields():
    return [
        {'field_key': 'summary', 'label': 'Summary', 'field_type': 'system_summary', 'sort_order': 0, 'is_required': True},
        {'field_key': 'description', 'label': 'Description', 'field_type': 'system_description', 'sort_order': 1, 'is_required': True},
        {'field_key': 'project', 'label': 'Project', 'field_type': 'system_project', 'sort_order': 2, 'is_required': True},
        {'field_key': 'work_type', 'label': 'Work Type', 'field_type': 'system_work_type', 'sort_order': 3, 'is_required': True},
    ]


def _all_custom_fields():
    return [
        {
            'field_key': 'short_note',
            'label': 'Short note',
            'field_type': 'short_text',
            'sort_order': 4,
            'is_required': False,
            'field_config': {'max_length': 100},
        },
        {
            'field_key': 'details',
            'label': 'Details',
            'field_type': 'paragraph',
            'sort_order': 5,
            'is_required': False,
        },
        {
            'field_key': 'priority',
            'label': 'Priority',
            'field_type': 'dropdown',
            'sort_order': 6,
            'is_required': False,
            'options': [{'value': 'high', 'label': 'High'}],
        },
        {
            'field_key': 'features',
            'label': 'Features',
            'field_type': 'checkbox',
            'sort_order': 7,
            'is_required': False,
            'options': [{'value': 'a', 'label': 'A'}],
        },
        {
            'field_key': 'due_date',
            'label': 'Due date',
            'field_type': 'date',
            'sort_order': 8,
            'is_required': False,
        },
        {
            'field_key': 'invoice',
            'label': 'Invoice',
            'field_type': 'file',
            'sort_order': 9,
            'is_required': False,
            'max_files': 10,
            'max_file_size_mb': 25,
        },
    ]


class TestBulkFieldsAllTypes:
    def test_put_accepts_all_six_custom_types(self, member_client, project):
        form = TicketForm.objects.create(project=project, name='All types')
        ensure_system_fields(form)
        payload = {'fields': _base_system_fields() + _all_custom_fields()}
        response = member_client.put(_fields_url(form.slug), payload, format='json')
        assert response.status_code == status.HTTP_200_OK
        assert form.fields.exclude(field_key__in=TicketFormField.SYSTEM_FIELD_KEYS).count() == 6

    def test_rejects_removed_custom_field_types(self, member_client, project):
        form = TicketForm.objects.create(project=project, name='Legacy type')
        ensure_system_fields(form)
        payload = {'fields': _base_system_fields() + [
            {'field_key': 'due_at', 'label': 'Due at', 'field_type': 'timestamp', 'sort_order': 4},
        ]}
        response = member_client.put(_fields_url(form.slug), payload, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_rejects_dropdown_without_options(self, member_client, project):
        form = TicketForm.objects.create(project=project, name='F1')
        ensure_system_fields(form)
        payload = {'fields': _base_system_fields() + [
            {'field_key': 'priority', 'label': 'Priority', 'field_type': 'dropdown', 'sort_order': 4, 'options': []},
        ]}
        response = member_client.put(_fields_url(form.slug), payload, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST


class TestSubmitCustomFieldTypes:
    def test_submit_stores_custom_field_values(
        self, member_client, experience_group, default_form, csm_queue,
        support_project, work_type, user,
    ):
        ensure_system_fields(default_form)
        TicketFormField.objects.create(
            form=default_form, field_key='link', label='Link',
            field_type=TicketFormField.FieldType.URL, sort_order=10,
        )
        TicketFormField.objects.create(
            form=default_form, field_key='owner', label='Owner',
            field_type=TicketFormField.FieldType.PEOPLE, sort_order=11,
            field_config={'allow_multiple': False},
        )
        answers = {
            'summary': 'Need help',
            'description': 'Details here',
            'project': support_project.id,
            'work_type': work_type.id,
            'link': 'https://example.com/page',
            'owner': user.id,
        }
        response = member_client.post(
            _submit_url(experience_group.slug),
            {'answers': json.dumps(answers)},
        )
        assert response.status_code == status.HTTP_201_CREATED
        ticket = Ticket.objects.get(pk=response.data['ticket_id'])
        assert ticket.custom_field_values['link'] == 'https://example.com/page'
        assert ticket.custom_field_values['owner'] == user.id

    def test_rejects_invalid_url(
        self, member_client, experience_group, default_form, csm_queue,
        support_project, work_type,
    ):
        TicketFormField.objects.create(
            form=default_form, field_key='link', label='Link',
            field_type=TicketFormField.FieldType.URL, sort_order=10, is_required=True,
        )
        answers = {
            'summary': 'Need help',
            'description': 'Details',
            'project': support_project.id,
            'work_type': work_type.id,
            'link': 'not-a-url',
        }
        response = member_client.post(
            _submit_url(experience_group.slug),
            {'answers': json.dumps(answers)},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'link' in response.data

    def test_rejects_invalid_people_id(
        self, member_client, experience_group, default_form, csm_queue,
        support_project, work_type,
    ):
        TicketFormField.objects.create(
            form=default_form, field_key='owner', label='Owner',
            field_type=TicketFormField.FieldType.PEOPLE, sort_order=10, is_required=True,
            field_config={'allow_multiple': False},
        )
        answers = {
            'summary': 'Need help',
            'description': 'Details',
            'project': support_project.id,
            'work_type': work_type.id,
            'owner': 999999,
        }
        response = member_client.post(
            _submit_url(experience_group.slug),
            {'answers': json.dumps(answers)},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'owner' in response.data
