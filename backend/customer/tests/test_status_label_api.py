from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from core.models import Organization, Project, ProjectMember
from customer.models import Customer, CustomerStatusLabel

User = get_user_model()

LIST_URL = '/api/customer-status-labels/'
REORDER_URL = '/api/customer-status-labels/reorder/'


def detail_url(pk):
    return f'/api/customer-status-labels/{pk}/'


class StatusLabelAPITest(APITestCase):
    """Status labels are project-scoped: one shared set per project."""

    def setUp(self):
        self.org = Organization.objects.create(name='Acme')
        self.project = Project.objects.create(name='Support Desk', organization=self.org)
        self.other_project = Project.objects.create(name='Other Desk', organization=self.org)

        self.member = User.objects.create_user(
            username='member', email='member@test.com', password='pass'
        )
        ProjectMember.objects.create(user=self.member, project=self.project, is_active=True)

        self.outsider = User.objects.create_user(
            username='outsider', email='outsider@test.com', password='pass'
        )

    # ── Create ────────────────────────────────────────────────────────────────

    def test_member_can_create_label(self):
        self.client.force_authenticate(self.member)
        res = self.client.post(
            f'{LIST_URL}?project={self.project.id}',
            {'name': 'Gold', 'color': '#E0A800'},
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['name'], 'Gold')
        self.assertEqual(res.data['project'], self.project.id)

    def test_non_member_cannot_access_project(self):
        self.client.force_authenticate(self.outsider)
        res = self.client.get(f'{LIST_URL}?project={self.project.id}')
        self.assertIn(res.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_400_BAD_REQUEST))

    # ── List scoping ────────────────────────────────────────────────────────────

    def test_list_only_returns_this_projects_labels(self):
        CustomerStatusLabel.objects.create(project=self.project, name='Gold', color='#E0A800')
        CustomerStatusLabel.objects.create(project=self.other_project, name='Hidden', color='#000000')
        self.client.force_authenticate(self.member)
        res = self.client.get(f'{LIST_URL}?project={self.project.id}')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        rows = res.data['results'] if isinstance(res.data, dict) else res.data
        names = {row['name'] for row in rows}
        self.assertEqual(names, {'Gold'})

    # ── Rename ──────────────────────────────────────────────────────────────────

    def test_member_can_rename_label(self):
        label = CustomerStatusLabel.objects.create(project=self.project, name='Gold', color='#E0A800')
        self.client.force_authenticate(self.member)
        res = self.client.patch(detail_url(label.id), {'name': 'Premium'})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        label.refresh_from_db()
        self.assertEqual(label.name, 'Premium')

    # ── Reorder ─────────────────────────────────────────────────────────────────

    def test_reorder_updates_order(self):
        a = CustomerStatusLabel.objects.create(project=self.project, name='A', color='#111', order=0)
        b = CustomerStatusLabel.objects.create(project=self.project, name='B', color='#222', order=1)
        c = CustomerStatusLabel.objects.create(project=self.project, name='C', color='#333', order=2)
        self.client.force_authenticate(self.member)
        res = self.client.put(
            f'{REORDER_URL}?project={self.project.id}',
            {'ids': [c.id, a.id, b.id]}, format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        a.refresh_from_db(); b.refresh_from_db(); c.refresh_from_db()
        self.assertEqual((c.order, a.order, b.order), (0, 1, 2))

    def test_reorder_rejects_label_from_other_project(self):
        mine = CustomerStatusLabel.objects.create(project=self.project, name='Mine', color='#111')
        theirs = CustomerStatusLabel.objects.create(project=self.other_project, name='Theirs', color='#222')
        self.client.force_authenticate(self.member)
        res = self.client.put(
            f'{REORDER_URL}?project={self.project.id}',
            {'ids': [mine.id, theirs.id]}, format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    # ── Delete + confirmation flow (AC) ─────────────────────────────────────────

    def test_delete_unused_label_succeeds(self):
        label = CustomerStatusLabel.objects.create(project=self.project, name='Gold', color='#E0A800')
        self.client.force_authenticate(self.member)
        res = self.client.delete(detail_url(label.id))
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(CustomerStatusLabel.objects.filter(id=label.id).exists())

    def test_delete_label_in_use_warns_then_force_deletes(self):
        label = CustomerStatusLabel.objects.create(project=self.project, name='Gold', color='#E0A800')
        customer = Customer.objects.create(
            email='c@test.com', full_name='C', project=self.project, status_label=label,
        )
        self.client.force_authenticate(self.member)

        # First attempt — blocked with confirmation warning.
        res = self.client.delete(detail_url(label.id))
        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)
        self.assertTrue(res.data['requires_confirmation'])
        self.assertEqual(res.data['customer_count'], 1)
        self.assertTrue(CustomerStatusLabel.objects.filter(id=label.id).exists())

        # Confirmed — force delete proceeds and clears the customer's label.
        res = self.client.delete(detail_url(label.id) + '?force=true')
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(CustomerStatusLabel.objects.filter(id=label.id).exists())
        customer.refresh_from_db()
        self.assertIsNone(customer.status_label)
