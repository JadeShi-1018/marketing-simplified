from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from core.models import Organization, Project, ProjectMember
from csm.models import CustomerUser
from customer.models import (
    Customer, CustomerOrganisation, CustomerInternalNote, CustomerInternalNoteAuditLog,
)

User = get_user_model()

BASE = '/api/customer-internal-notes/'
AUDIT = '/api/customer-internal-note-audit-logs/'


def doc(text):
    return {'type': 'doc', 'content': [
        {'type': 'paragraph', 'content': [{'type': 'text', 'text': text}]},
    ]}


def detail(pk):
    return f'{BASE}{pk}/'


class InternalNoteAPITest(APITestCase):
    def setUp(self):
        self.org = Organization.objects.create(name='Acme')
        self.project = Project.objects.create(name='Desk', organization=self.org)
        self.customer = Customer.objects.create(
            email='c@test.com', full_name='Cust', project=self.project,
        )

        self.author = User.objects.create_user(username='a', email='a@test.com', password='p')
        self.other = User.objects.create_user(username='b', email='b@test.com', password='p')

        # An admin of a CustomerOrganisation → is_csm_admin True.
        self.admin = User.objects.create_user(username='adm', email='adm@test.com', password='p')
        cust_org = CustomerOrganisation.objects.create(name='Org')
        CustomerUser.objects.create(
            user=self.admin, organisation=cust_org, user_type='admin', is_active=True,
        )

        # Notes are project-scoped: all three users are members of self.project
        # so they can access self.customer's notes.
        for u in (self.author, self.other, self.admin):
            ProjectMember.objects.create(user=u, project=self.project, is_active=True)

    # ── Create ────────────────────────────────────────────────────────────────

    def test_create_sets_author_and_extracts_text(self):
        self.client.force_authenticate(self.author)
        res = self.client.post(BASE, {'customer': self.customer.id, 'body': doc('Hello world')}, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['author'], self.author.id)
        self.assertEqual(res.data['body_text'], 'Hello world')
        self.assertTrue(res.data['is_author'])

    def test_create_records_audit(self):
        self.client.force_authenticate(self.author)
        res = self.client.post(BASE, {'customer': self.customer.id, 'body': doc('x')}, format='json')
        self.assertTrue(
            CustomerInternalNoteAuditLog.objects.filter(
                note_id=res.data['id'], event_type='note.created',
            ).exists()
        )

    # ── List filtered by customer ───────────────────────────────────────────────

    def test_list_filtered_by_customer(self):
        other_customer = Customer.objects.create(email='o@test.com', full_name='O', project=self.project)
        CustomerInternalNote.objects.create(customer=self.customer, author=self.author, body=doc('mine'))
        CustomerInternalNote.objects.create(customer=other_customer, author=self.author, body=doc('hidden'))
        self.client.force_authenticate(self.author)
        res = self.client.get(BASE, {'customer': self.customer.id})
        rows = res.data['results'] if isinstance(res.data, dict) else res.data
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['body_text'], 'mine')

    # ── Edit: author only ───────────────────────────────────────────────────────

    def test_author_can_edit_own_note(self):
        note = CustomerInternalNote.objects.create(customer=self.customer, author=self.author, body=doc('v1'))
        self.client.force_authenticate(self.author)
        res = self.client.patch(detail(note.id), {'body': doc('v2')}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['body_text'], 'v2')
        self.assertTrue(res.data['is_edited'])

    def test_non_author_cannot_edit(self):
        note = CustomerInternalNote.objects.create(customer=self.customer, author=self.author, body=doc('v1'))
        self.client.force_authenticate(self.other)
        res = self.client.patch(detail(note.id), {'body': doc('hack')}, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    # ── Delete: author or admin ─────────────────────────────────────────────────

    def test_author_can_delete_own_note(self):
        note = CustomerInternalNote.objects.create(customer=self.customer, author=self.author, body=doc('x'))
        self.client.force_authenticate(self.author)
        res = self.client.delete(detail(note.id))
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(CustomerInternalNote.objects.filter(id=note.id).exists())

    def test_non_author_non_admin_cannot_delete(self):
        note = CustomerInternalNote.objects.create(customer=self.customer, author=self.author, body=doc('x'))
        self.client.force_authenticate(self.other)
        res = self.client.delete(detail(note.id))
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(CustomerInternalNote.objects.filter(id=note.id).exists())

    def test_admin_can_delete_any_note_and_logs_audit(self):
        note = CustomerInternalNote.objects.create(customer=self.customer, author=self.author, body=doc('x'))
        self.client.force_authenticate(self.admin)
        res = self.client.delete(detail(note.id))
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        log = CustomerInternalNoteAuditLog.objects.filter(note_id=note.id, event_type='note.deleted').first()
        self.assertIsNotNone(log)
        self.assertEqual(log.actor, self.admin)

    # ── Auth required (never public) ────────────────────────────────────────────

    def test_requires_authentication(self):
        res = self.client.get(BASE, {'customer': self.customer.id})
        self.assertIn(res.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    # ── Project isolation (no cross-project leakage) ────────────────────────────

    def test_user_cannot_list_notes_from_inaccessible_project(self):
        """An authenticated user who is not in the customer's project sees nothing."""
        outsider = User.objects.create_user(username='out', email='out@test.com', password='p')
        CustomerInternalNote.objects.create(customer=self.customer, author=self.author, body=doc('secret'))
        self.client.force_authenticate(outsider)
        res = self.client.get(BASE, {'customer': self.customer.id})
        rows = res.data['results'] if isinstance(res.data, dict) else res.data
        self.assertEqual(len(rows), 0)

    def test_user_cannot_retrieve_note_from_inaccessible_project(self):
        outsider = User.objects.create_user(username='out2', email='out2@test.com', password='p')
        note = CustomerInternalNote.objects.create(customer=self.customer, author=self.author, body=doc('secret'))
        self.client.force_authenticate(outsider)
        res = self.client.get(detail(note.id))
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_user_cannot_create_note_on_inaccessible_customer(self):
        outsider = User.objects.create_user(username='out3', email='out3@test.com', password='p')
        self.client.force_authenticate(outsider)
        res = self.client.post(BASE, {'customer': self.customer.id, 'body': doc('x')}, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(CustomerInternalNote.objects.filter(customer=self.customer).exists())

    def test_audit_log_scoped_to_accessible_projects(self):
        outsider = User.objects.create_user(username='out4', email='out4@test.com', password='p')
        CustomerInternalNoteAuditLog.objects.create(
            customer=self.customer, actor=self.author, event_type='note.created', note_id=1,
        )
        self.client.force_authenticate(outsider)
        res = self.client.get(AUDIT, {'customer': self.customer.id})
        rows = res.data['results'] if isinstance(res.data, dict) else res.data
        self.assertEqual(len(rows), 0)
