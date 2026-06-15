"""
Tests: project-level invite and approval are blocked when org seat cap is full.
"""
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from core.models import Organization, Project, ProjectMember, ProjectInvitation
from stripe_meta.models import Plan, Subscription

User = get_user_model()


def _make_free_subscription(org):
    plan = Plan.objects.create(name='Free', monthly_token_quota=10_000, included_seats=1)
    now = timezone.now()
    return Subscription.objects.create(
        organization=org,
        plan=plan,
        stripe_subscription_id='sub_free_test',
        start_date=now,
        end_date=now.replace(year=now.year + 1),
        seat_count=1,
        is_active=True,
        is_internal=True,
    )


class SeatCapInviteTest(APITestCase):
    def setUp(self):
        Plan.objects.all().delete()
        self.org = Organization.objects.create(name='SeatCapOrg')
        self.owner = User.objects.create_user(
            email='owner@seatcap.com', username='seatowner', password='pw',
            organization=self.org,
        )
        self.project = Project.objects.create(
            name='SeatProject', organization=self.org, owner=self.owner,
        )
        ProjectMember.objects.create(project=self.project, user=self.owner, role='owner', is_active=True)
        self.sub = _make_free_subscription(self.org)
        self.client.force_authenticate(user=self.owner)

    def _invite_url(self):
        return reverse('project-member-list', kwargs={'project_id': self.project.id})

    def _approve_url(self, invitation_id):
        return reverse('approve-project-invitation', kwargs={
            'project_id': self.project.id,
            'invitation_id': invitation_id,
        })

    def test_invite_blocked_when_seat_full(self):
        """Free org with 1 seat (1 current member) → invite blocked with SEAT_LIMIT_REACHED."""
        response = self.client.post(self._invite_url(), {'email': 'newuser@example.com'})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data['code'], 'SEAT_LIMIT_REACHED')
        self.assertTrue(response.data['upgrade_required'])
        self.assertEqual(ProjectInvitation.objects.filter(project=self.project).count(), 0)

    def test_invite_allowed_when_seat_available(self):
        """Org with extra seat → invite goes through."""
        self.sub.seat_count = 2
        self.sub.save()
        response = self.client.post(self._invite_url(), {'email': 'newuser@example.com'})
        # 201 or 400 (email doesn't exist, etc.) — important: NOT 403 SEAT_LIMIT_REACHED
        self.assertNotEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        if response.status_code == status.HTTP_403_FORBIDDEN:
            self.assertNotEqual(response.data.get('code'), 'SEAT_LIMIT_REACHED')

    def _make_pending_invitation(self):
        return ProjectInvitation.objects.create(
            email='pending@example.com',
            project=self.project,
            invited_by=self.owner,
            role='member',
            approved=False,
            accepted=False,
            expires_at=timezone.now() + timezone.timedelta(days=7),
        )

    def test_approval_blocked_when_seat_full(self):
        """Approval of a pending invite is blocked when seat is full at approval time."""
        invitation = self._make_pending_invitation()
        response = self.client.post(self._approve_url(invitation.id))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data['code'], 'SEAT_LIMIT_REACHED')
        invitation.refresh_from_db()
        self.assertFalse(invitation.approved)

    def test_approval_allowed_when_seat_available(self):
        """Approval succeeds when a seat is free."""
        self.sub.seat_count = 2
        self.sub.save()
        invitation = self._make_pending_invitation()
        response = self.client.post(self._approve_url(invitation.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        invitation.refresh_from_db()
        self.assertTrue(invitation.approved)
