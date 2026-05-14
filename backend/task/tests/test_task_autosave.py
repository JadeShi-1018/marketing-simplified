"""
Tests for the task form autosave endpoints.

GET  /api/task-form-autosave/?type=<task_type>
PUT  /api/task-form-autosave/?type=<task_type>
DELETE /api/task-form-autosave/?type=<task_type>
"""
import json

from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status

User = get_user_model()

# Use a local-memory cache so tests are hermetic — no Redis needed.
CACHE_OVERRIDE = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
    }
}

URL = '/api/task-form-autosave/'
VALID_TYPE = 'execution'
ANOTHER_VALID_TYPE = 'budget'


@override_settings(CACHES=CACHE_OVERRIDE)
class TaskFormAutosaveTests(TestCase):

    def setUp(self):
        self.user_a = User.objects.create_user(
            email='user_a@example.com',
            username='user_a',
            password='pass',
        )
        self.user_b = User.objects.create_user(
            email='user_b@example.com',
            username='user_b',
            password='pass',
        )
        self.client_a = APIClient()
        self.client_a.force_authenticate(user=self.user_a)
        self.client_b = APIClient()
        self.client_b.force_authenticate(user=self.user_b)

    # ------------------------------------------------------------------
    # GET — no draft → 204
    # ------------------------------------------------------------------
    def test_get_no_draft_returns_204(self):
        response = self.client_a.get(URL, {'type': VALID_TYPE})
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

    # ------------------------------------------------------------------
    # PUT then GET → 200 with matching payload
    # ------------------------------------------------------------------
    def test_put_then_get_returns_payload(self):
        payload = {'summary': 'My task', 'priority': 'HIGH', 'extra': 42}
        put_resp = self.client_a.put(
            URL + f'?type={VALID_TYPE}',
            data=payload,
            format='json',
        )
        self.assertEqual(put_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(put_resp.data, payload)

        get_resp = self.client_a.get(URL, {'type': VALID_TYPE})
        self.assertEqual(get_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(get_resp.data, payload)

    # ------------------------------------------------------------------
    # DELETE then GET → 204
    # ------------------------------------------------------------------
    def test_delete_then_get_returns_204(self):
        payload = {'summary': 'will be deleted'}
        self.client_a.put(URL + f'?type={VALID_TYPE}', data=payload, format='json')
        del_resp = self.client_a.delete(URL + f'?type={VALID_TYPE}')
        self.assertEqual(del_resp.status_code, status.HTTP_204_NO_CONTENT)

        get_resp = self.client_a.get(URL, {'type': VALID_TYPE})
        self.assertEqual(get_resp.status_code, status.HTTP_204_NO_CONTENT)

    # ------------------------------------------------------------------
    # Cross-user isolation: user A cannot read user B's draft
    # ------------------------------------------------------------------
    def test_user_a_cannot_read_user_b_draft(self):
        payload = {'secret': 'user_b_data'}
        self.client_b.put(URL + f'?type={VALID_TYPE}', data=payload, format='json')

        get_resp = self.client_a.get(URL, {'type': VALID_TYPE})
        self.assertEqual(get_resp.status_code, status.HTTP_204_NO_CONTENT)

    def test_user_a_cannot_overwrite_user_b_draft(self):
        b_payload = {'note': 'belongs to B'}
        a_payload = {'note': 'belongs to A'}
        self.client_b.put(URL + f'?type={VALID_TYPE}', data=b_payload, format='json')
        self.client_a.put(URL + f'?type={VALID_TYPE}', data=a_payload, format='json')

        resp = self.client_b.get(URL, {'type': VALID_TYPE})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['note'], 'belongs to B')

    # ------------------------------------------------------------------
    # Invalid `type` → 400
    # ------------------------------------------------------------------
    def test_get_invalid_type_returns_400(self):
        response = self.client_a.get(URL, {'type': 'not_a_real_type'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', response.data)

    def test_put_invalid_type_returns_400(self):
        response = self.client_a.put(
            URL + '?type=bad_type',
            data={'x': 1},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_delete_invalid_type_returns_400(self):
        response = self.client_a.delete(URL + '?type=bad_type')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_missing_type_returns_400(self):
        response = self.client_a.get(URL)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # ------------------------------------------------------------------
    # Oversized payload → 400
    # ------------------------------------------------------------------
    def test_oversized_payload_returns_400(self):
        big_value = 'x' * (16 * 1024 + 1)
        response = self.client_a.put(
            URL + f'?type={VALID_TYPE}',
            data=json.dumps({'data': big_value}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', response.data)

    # ------------------------------------------------------------------
    # Unauthenticated access → 401 / 403
    # ------------------------------------------------------------------
    def test_unauthenticated_get_rejected(self):
        anon = APIClient()
        response = anon.get(URL, {'type': VALID_TYPE})
        self.assertIn(response.status_code, [
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
        ])

    # ------------------------------------------------------------------
    # All 11 valid types are accepted
    # ------------------------------------------------------------------
    def test_all_valid_types_accepted(self):
        valid_types = [
            'budget', 'asset', 'retrospective', 'report', 'execution',
            'scaling', 'alert', 'experiment', 'optimization',
            'communication', 'platform_policy_update',
        ]
        for t in valid_types:
            with self.subTest(task_type=t):
                resp = self.client_a.get(URL, {'type': t})
                self.assertNotEqual(
                    resp.status_code,
                    status.HTTP_400_BAD_REQUEST,
                    msg=f'Type {t!r} should be valid',
                )

    # ------------------------------------------------------------------
    # Drafts are isolated per task type
    # ------------------------------------------------------------------
    def test_different_types_are_isolated(self):
        payload_exec = {'note': 'execution draft'}
        payload_budget = {'note': 'budget draft'}
        self.client_a.put(URL + f'?type={VALID_TYPE}', data=payload_exec, format='json')
        self.client_a.put(URL + f'?type={ANOTHER_VALID_TYPE}', data=payload_budget, format='json')

        resp_exec = self.client_a.get(URL, {'type': VALID_TYPE})
        resp_budget = self.client_a.get(URL, {'type': ANOTHER_VALID_TYPE})
        self.assertEqual(resp_exec.data['note'], 'execution draft')
        self.assertEqual(resp_budget.data['note'], 'budget draft')
