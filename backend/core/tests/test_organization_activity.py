"""
Tests for OrganizationActivityEvent model, service, and API integration.
"""

from django.test import TestCase
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status

from core.models import Organization, OrganizationActivityEvent, OrganizationMembership
from core.services.organization_activity import (
    log_org_activity,
    get_recent_org_activity,
    build_human_readable,
)

User = get_user_model()


def make_user(email, password='testpass123'):
    u = User.objects.create_user(username=email.split('@')[0], email=email, password=password)
    return u


def make_org(name='Test Org'):
    return Organization.objects.create(name=name)


def make_membership(user, org, role='member'):
    return OrganizationMembership.objects.get_or_create(
        user=user, organization=org,
        defaults={'role': role, 'is_active': True},
    )[0]


class LogOrgActivityTest(TestCase):
    def setUp(self):
        self.org = make_org()
        self.user = make_user('actor@example.com')
        self.target = make_user('target@example.com')

    def test_creates_member_joined_event(self):
        log_org_activity(
            self.org, 'member_joined',
            actor=self.user,
            target_user=self.target,
            metadata={'role': 'member'},
        )
        ev = OrganizationActivityEvent.objects.get(organization=self.org, event_type='member_joined')
        self.assertEqual(ev.actor, self.user)
        self.assertEqual(ev.target_user, self.target)
        self.assertEqual(ev.metadata['role'], 'member')

    def test_creates_member_removed_event(self):
        log_org_activity(self.org, 'member_removed', actor=self.user, target_user=self.target)
        self.assertTrue(
            OrganizationActivityEvent.objects.filter(
                organization=self.org, event_type='member_removed'
            ).exists()
        )

    def test_token_quota_warning_deduplication(self):
        meta = {'year_month': '2026-06', 'threshold': 80, 'quota': 1_000_000}
        log_org_activity(self.org, 'token_quota_warning', metadata=meta)
        log_org_activity(self.org, 'token_quota_warning', metadata=meta)  # duplicate
        count = OrganizationActivityEvent.objects.filter(
            organization=self.org, event_type='token_quota_warning'
        ).count()
        self.assertEqual(count, 1, "Token warning should only be logged once per month/threshold")

    def test_token_quota_warning_different_months_both_logged(self):
        log_org_activity(self.org, 'token_quota_warning',
                         metadata={'year_month': '2026-05', 'threshold': 80, 'quota': 1_000_000})
        log_org_activity(self.org, 'token_quota_warning',
                         metadata={'year_month': '2026-06', 'threshold': 80, 'quota': 1_000_000})
        count = OrganizationActivityEvent.objects.filter(
            organization=self.org, event_type='token_quota_warning'
        ).count()
        self.assertEqual(count, 2)

    def test_token_quota_exceeded_deduplication(self):
        meta = {'year_month': '2026-06', 'threshold': 100, 'quota': 1_000_000}
        log_org_activity(self.org, 'token_quota_exceeded', metadata=meta)
        log_org_activity(self.org, 'token_quota_exceeded', metadata=meta)
        self.assertEqual(
            OrganizationActivityEvent.objects.filter(
                organization=self.org, event_type='token_quota_exceeded'
            ).count(),
            1,
        )

    def test_exception_does_not_propagate(self):
        """log_org_activity should never raise even on bad input."""
        try:
            log_org_activity(None, 'member_joined')  # bad org — will fail silently
        except Exception as e:  # noqa: BLE001
            self.fail(f"log_org_activity raised unexpectedly: {e}")


class GetRecentOrgActivityTest(TestCase):
    def setUp(self):
        self.org = make_org()
        self.user = make_user('u@example.com')

    def test_returns_events_in_desc_order(self):
        log_org_activity(self.org, 'member_joined', target_user=self.user, metadata={'role': 'member'})
        log_org_activity(self.org, 'plan_subscribed', metadata={'plan_name': 'Team'})

        events = list(get_recent_org_activity(self.org.id))
        self.assertEqual(len(events), 2)
        # Most recent first
        self.assertEqual(events[0].event_type, 'plan_subscribed')

    def test_respects_limit(self):
        for i in range(10):
            log_org_activity(self.org, 'member_joined',
                             target_user=self.user, metadata={'role': 'member'})
        events = list(get_recent_org_activity(self.org.id, limit=3))
        self.assertEqual(len(events), 3)

    def test_does_not_leak_other_org_events(self):
        other_org = make_org('Other Org')
        log_org_activity(other_org, 'member_joined', target_user=self.user, metadata={'role': 'member'})
        self.assertEqual(get_recent_org_activity(self.org.id).count(), 0)


class BuildHumanReadableTest(TestCase):
    def _make_event(self, event_type, actor=None, target_user=None, metadata=None):
        org = make_org('HR Test Org')
        ev = OrganizationActivityEvent(
            organization=org,
            event_type=event_type,
            actor=actor,
            target_user=target_user,
            metadata=metadata or {},
        )
        return ev

    def test_member_joined(self):
        target = make_user('jane@example.com')
        target.name = 'Jane'
        ev = self._make_event('member_joined', target_user=target, metadata={'role': 'admin'})
        self.assertEqual(build_human_readable(ev), 'Jane joined as Admin')

    def test_member_removed(self):
        actor = make_user('actor@example.com')
        actor.name = 'Bob'
        target = make_user('target@example.com')
        target.name = 'Alice'
        ev = self._make_event('member_removed', actor=actor, target_user=target)
        self.assertIn('Bob', build_human_readable(ev))
        self.assertIn('Alice', build_human_readable(ev))

    def test_member_left(self):
        target = make_user('jane2@example.com')
        target.name = 'Jane'
        ev = self._make_event('member_left', target_user=target)
        self.assertIn('left the organization', build_human_readable(ev))

    def test_plan_subscribed(self):
        ev = self._make_event('plan_subscribed', metadata={'plan_name': 'Team'})
        self.assertIn('Team', build_human_readable(ev))

    def test_plan_changed(self):
        ev = self._make_event('plan_changed', metadata={'old_plan': 'Free', 'new_plan': 'Pro'})
        msg = build_human_readable(ev)
        self.assertIn('Free', msg)
        self.assertIn('Pro', msg)

    def test_token_quota_warning(self):
        ev = self._make_event('token_quota_warning', metadata={'threshold': 80})
        self.assertIn('80%', build_human_readable(ev))

    def test_token_quota_exceeded(self):
        ev = self._make_event('token_quota_exceeded')
        self.assertIn('exceeded', build_human_readable(ev).lower())

    def test_token_overage_started(self):
        ev = self._make_event('token_overage_started', metadata={'overage_tokens': 120_000})
        self.assertIn('120K', build_human_readable(ev))

    def test_seats_changed_increased(self):
        ev = self._make_event('seats_changed', metadata={'old_seats': 5, 'new_seats': 8})
        msg = build_human_readable(ev)
        self.assertIn('increased', msg)

    def test_seats_changed_decreased(self):
        ev = self._make_event('seats_changed', metadata={'old_seats': 8, 'new_seats': 3})
        msg = build_human_readable(ev)
        self.assertIn('decreased', msg)


class OrgDetailActivityAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.org = make_org('API Test Org')
        self.admin = make_user('admin@example.com')
        self.admin.current_organization = self.org
        self.admin.save()
        make_membership(self.admin, self.org, role='admin')
        self.client.force_authenticate(user=self.admin)

    def _url(self):
        return f'/api/core/organizations/{self.org.id}/'

    def test_recent_activity_empty_list_returned(self):
        resp = self.client.get(self._url())
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn('recent_activity', resp.data)
        self.assertIsInstance(resp.data['recent_activity'], list)

    def test_recent_activity_contains_events(self):
        log_org_activity(self.org, 'plan_subscribed', metadata={'plan_name': 'Team'})
        resp = self.client.get(self._url())
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        activities = resp.data['recent_activity']
        self.assertEqual(len(activities), 1)
        ev = activities[0]
        self.assertEqual(ev['event_type'], 'plan_subscribed')
        self.assertEqual(ev['category'], 'plan')
        self.assertIn('message', ev)
        self.assertIn('created_at', ev)

    def test_recent_activity_max_15_events(self):
        for _ in range(20):
            log_org_activity(self.org, 'member_joined', metadata={'role': 'member'})
        resp = self.client.get(self._url())
        self.assertLessEqual(len(resp.data['recent_activity']), 15)
