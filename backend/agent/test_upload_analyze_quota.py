"""
Tests: FileUploadAnalyzeView surfaces QuotaError to the SSE stream instead of
swallowing it into the generic "An internal error occurred" message.
"""
import json
from unittest.mock import patch, MagicMock

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from core.models import Organization, Project, ProjectMember
from stripe_meta.exceptions import QuotaError
from stripe_meta.models import Plan

User = get_user_model()

URL = '/api/agent/upload-analyze/'

_FAKE_SAVE_RESULT = {
    'id': 'fake-file-id',
    'filename': 'test.csv',
    'original_filename': 'test.csv',
    'row_count': 2,
    'column_count': 2,
}


def _quota_generator(code, message):
    """Generator that raises QuotaError on first iteration."""
    def gen(*args, **kwargs):
        raise QuotaError(code=code, message=message)
        yield  # makes this a generator function
    return gen


def _parse_sse(response) -> list[dict]:
    content = b''.join(response.streaming_content)
    chunks = []
    for line in content.decode().splitlines():
        if line.startswith('data: '):
            try:
                chunks.append(json.loads(line[6:]))
            except json.JSONDecodeError:
                pass
    return chunks


class FileUploadAnalyzeQuotaTest(APITestCase):
    def setUp(self):
        Plan.objects.all().delete()
        self.org = Organization.objects.create(name='UploadOrg')
        self.user = User.objects.create_user(
            email='upload@test.com', username='uploaduser', password='pw',
        )
        self.user.organization = self.org
        self.user.save()
        self.project = Project.objects.create(
            name='UploadProj', organization=self.org, owner=self.user,
        )
        ProjectMember.objects.create(project=self.project, user=self.user)
        self.client.force_authenticate(user=self.user)

    def _post(self, quota_code, quota_message):
        with patch('agent.views.AgentOrchestrator') as MockOrch, \
             patch('agent.views.data_service') as mock_ds:
            mock_ds.save_uploaded_file.return_value = _FAKE_SAVE_RESULT
            inst = MagicMock()
            inst.handle_message.side_effect = _quota_generator(quota_code, quota_message)
            MockOrch.return_value = inst

            import io
            csv_bytes = io.BytesIO(b'campaign,spend\nA,100\nB,200')
            csv_bytes.name = 'test.csv'
            return self.client.post(
                URL,
                {'file': csv_bytes},
                format='multipart',
                HTTP_X_PROJECT_ID=str(self.project.id),
            )

    def test_project_has_no_org_surfaced(self):
        response = self._post('PROJECT_HAS_NO_ORG', 'This project is not linked to an organization.')
        self.assertEqual(response.status_code, 200)
        chunks = _parse_sse(response)
        quota = [c for c in chunks if c.get('code') == 'PROJECT_HAS_NO_ORG']
        self.assertTrue(quota, f"Expected PROJECT_HAS_NO_ORG chunk; got: {chunks}")
        generic = [c for c in chunks if 'internal error' in str(c.get('content', '')).lower()]
        self.assertFalse(generic, f"Got generic error instead of quota code: {chunks}")

    def test_token_quota_exceeded_surfaced(self):
        response = self._post('TOKEN_QUOTA_EXCEEDED', 'Monthly quota exceeded.')
        self.assertEqual(response.status_code, 200)
        chunks = _parse_sse(response)
        quota = [c for c in chunks if c.get('code') == 'TOKEN_QUOTA_EXCEEDED']
        self.assertTrue(quota, f"Expected TOKEN_QUOTA_EXCEEDED chunk; got: {chunks}")

    def test_single_call_too_large_surfaced(self):
        response = self._post('SINGLE_CALL_TOO_LARGE', 'Request too large.')
        self.assertEqual(response.status_code, 200)
        chunks = _parse_sse(response)
        quota = [c for c in chunks if c.get('code') == 'SINGLE_CALL_TOO_LARGE']
        self.assertTrue(quota, f"Expected SINGLE_CALL_TOO_LARGE chunk; got: {chunks}")

    def test_non_quota_exception_still_generic(self):
        """Regular exceptions still yield the generic error (regression guard)."""
        with patch('agent.views.AgentOrchestrator') as MockOrch, \
             patch('agent.views.data_service') as mock_ds:
            mock_ds.save_uploaded_file.return_value = _FAKE_SAVE_RESULT
            inst = MagicMock()
            inst.handle_message.side_effect = RuntimeError('some unexpected error')
            MockOrch.return_value = inst

            import io
            csv_bytes = io.BytesIO(b'campaign,spend\nA,100\nB,200')
            csv_bytes.name = 'test.csv'
            response = self.client.post(
                URL,
                {'file': csv_bytes},
                format='multipart',
                HTTP_X_PROJECT_ID=str(self.project.id),
            )

        self.assertEqual(response.status_code, 200)
        chunks = _parse_sse(response)
        generic = [c for c in chunks if 'internal error' in str(c.get('content', '')).lower()]
        self.assertTrue(generic, f"Expected generic error chunk; got: {chunks}")
