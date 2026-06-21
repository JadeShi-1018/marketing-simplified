import json

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework import status

from csm.models import Ticket, TicketForm, TicketFormAssignment, TicketFormField, TicketFormSubmission, TicketAttachment

pytestmark = pytest.mark.django_db


def _request_form_url(eg_id):
    return reverse('experience-group-request-form', kwargs={'pk': eg_id})


def _submit_url(eg_id):
    return reverse('experience-group-submit-request', kwargs={'pk': eg_id})


def _answers(**kwargs):
    base = {
        'summary': 'Printer not working',
        'description': 'Cannot print invoices',
        'project': '',
        'work_type': '',
    }
    base.update(kwargs)
    return base


class TestRequestForm:
    def test_returns_default_form(self, member_client, experience_group, default_form, user):
        response = member_client.get(_request_form_url(experience_group.slug))
        assert response.status_code == status.HTTP_200_OK
        assert response.data['form_id'] == default_form.id
        assert response.data['experience_group_id'] == experience_group.id
        assert len(response.data['fields']) == 4
        assert 'options' in response.data
        assert 'project_members' in response.data['options']
        member_ids = [m['id'] for m in response.data['options']['project_members']]
        assert user.id in member_ids

    def test_eg_assignment_overrides_default(
        self, member_client, experience_group, default_form, eg_specific_form,
    ):
        TicketFormAssignment.objects.create(form=eg_specific_form, experience_group=experience_group)
        response = member_client.get(_request_form_url(experience_group.slug))
        assert response.status_code == status.HTTP_200_OK
        assert response.data['form_id'] == eg_specific_form.id

    def test_404_when_no_form_configured(self, member_client, experience_group):
        response = member_client.get(_request_form_url(experience_group.slug))
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_non_member_forbidden(self, outsider_client, experience_group, default_form):
        response = outsider_client.get(_request_form_url(experience_group.slug))
        # Detail routes hide inaccessible objects (404) rather than 403
        assert response.status_code == status.HTTP_404_NOT_FOUND


class TestSubmitRequest:
    def test_creates_ticket_and_submission(
        self, member_client, experience_group, default_form, csm_queue,
        support_project, work_type,
    ):
        payload = {
            'answers': json.dumps(_answers(
                project=support_project.id,
                work_type=work_type.id,
            )),
        }
        response = member_client.post(_submit_url(experience_group.slug), payload)
        assert response.status_code == status.HTTP_201_CREATED
        assert Ticket.objects.filter(pk=response.data['ticket_id']).exists()
        assert TicketFormSubmission.objects.filter(pk=response.data['submission_id']).exists()

        ticket = Ticket.objects.get(pk=response.data['ticket_id'])
        assert ticket.title == 'Printer not working'
        assert ticket.form_id == default_form.id
        assert ticket.experience_group_id == experience_group.id

    def test_required_summary_blocks_submit(self, member_client, experience_group, default_form, csm_queue):
        payload = {'answers': json.dumps(_answers(summary=''))}
        response = member_client.post(_submit_url(experience_group.slug), payload)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'summary' in response.data

    def test_submit_with_url_field(
        self, member_client, experience_group, default_form, csm_queue,
        support_project, work_type,
    ):
        TicketFormField.objects.create(
            form=default_form, field_key='link', label='Link',
            field_type=TicketFormField.FieldType.URL, sort_order=10,
        )
        payload = {
            'answers': json.dumps(_answers(
                project=support_project.id,
                work_type=work_type.id,
                link='https://example.com',
            )),
        }
        response = member_client.post(_submit_url(experience_group.slug), payload)
        assert response.status_code == status.HTTP_201_CREATED

    def test_rejects_eleventh_file(
        self, member_client, experience_group, default_form, csm_queue,
        support_project, work_type,
    ):
        TicketFormField.objects.create(
            form=default_form, field_key='invoice', label='Invoice',
            field_type=TicketFormField.FieldType.FILE, sort_order=10,
        )
        payload = {
            'answers': json.dumps(_answers(
                project=support_project.id,
                work_type=work_type.id,
            )),
            'invoice': [
                SimpleUploadedFile(f'file{i}.pdf', b'x', content_type='application/pdf')
                for i in range(11)
            ],
        }
        response = member_client.post(_submit_url(experience_group.slug), payload, format='multipart')
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'attachments' in response.data

    def test_rejects_oversized_file(
        self, member_client, experience_group, default_form, csm_queue,
        support_project, work_type,
    ):
        TicketFormField.objects.create(
            form=default_form, field_key='invoice', label='Invoice',
            field_type=TicketFormField.FieldType.FILE, sort_order=10, max_file_size_mb=1,
        )
        payload = {
            'answers': json.dumps(_answers(
                project=support_project.id,
                work_type=work_type.id,
            )),
            'invoice': SimpleUploadedFile(
                'big.pdf',
                b'x' * (1024 * 1024 + 1),
                content_type='application/pdf',
            ),
        }
        response = member_client.post(_submit_url(experience_group.slug), payload, format='multipart')
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'attachments.invoice' in response.data

    def test_saves_file_attachment(
        self, member_client, experience_group, default_form, csm_queue,
        support_project, work_type,
    ):
        TicketFormField.objects.create(
            form=default_form, field_key='invoice', label='Invoice',
            field_type=TicketFormField.FieldType.FILE, sort_order=10,
        )
        payload = {
            'answers': json.dumps(_answers(
                project=support_project.id,
                work_type=work_type.id,
            )),
            'invoice': SimpleUploadedFile('invoice.pdf', b'%PDF-1.4', content_type='application/pdf'),
        }
        response = member_client.post(_submit_url(experience_group.slug), payload, format='multipart')
        assert response.status_code == status.HTTP_201_CREATED
        assert TicketAttachment.objects.filter(ticket_id=response.data['ticket_id']).count() == 1
