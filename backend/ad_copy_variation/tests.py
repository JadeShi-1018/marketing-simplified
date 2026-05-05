from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from facebook_integration.models import FacebookConnection, MetaAdAccount
from meta_ads.models import MetaAdCreative

from .models import AdCopyVariation


def _make_user(username='copy_user', email='copy_user@example.com'):
    User = get_user_model()
    return User.objects.create_user(username=username, email=email, password='x')


def _make_creative(user, *, meta_creative_id='cra-1', title='Headline A', body='Hook line\nDescription line', cta='SHOP_NOW'):
    connection = FacebookConnection.objects.create(
        user=user, fb_user_id=f'fb-{user.id}', is_active=True,
    )
    ad_account = MetaAdAccount.objects.create(
        connection=connection,
        meta_account_id=f'acc-{user.id}',
        name='Test Account',
        currency='USD',
    )
    return MetaAdCreative.objects.create(
        ad_account=ad_account,
        meta_creative_id=meta_creative_id,
        name=meta_creative_id,
        title=title,
        body=body,
        call_to_action_type=cta,
    )


_FAKE_GEMINI_RESPONSE = {
    'hook': 'Generated hook line',
    'headline': 'Generated headline',
    'description': 'Generated description',
    'cta': 'LEARN_MORE',
}


class AdCopyVariationCRUDTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = _make_user()
        cls.creative = _make_creative(cls.user)

    def setUp(self):
        self.client.force_authenticate(user=self.user)

    def _payload(self, **overrides):
        base = {
            'creative': self.creative.id,
            'source_mode': 'existing',
            'hook': 'h',
            'headline': 'hl',
            'description': 'd',
            'cta': 'SHOP_NOW',
            'instruction': 'rewrite',
        }
        base.update(overrides)
        return base

    def test_create_then_list(self):
        url = reverse('ad-copy-variation-list')
        resp = self.client.post(url, self._payload(), format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)

        list_resp = self.client.get(url)
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)
        body = list_resp.data
        results = body['results'] if isinstance(body, dict) and 'results' in body else body
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['hook'], 'h')

    def test_retrieve(self):
        row = AdCopyVariation.objects.create(
            creative=self.creative,
            source_mode='custom',
            hook='retrieve hook',
            created_by=self.user,
        )
        url = reverse('ad-copy-variation-detail', args=[row.id])
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['hook'], 'retrieve hook')
        self.assertEqual(resp.data['source_mode'], 'custom')

    def test_patch(self):
        row = AdCopyVariation.objects.create(
            creative=self.creative,
            source_mode='existing',
            hook='before',
            created_by=self.user,
        )
        url = reverse('ad-copy-variation-detail', args=[row.id])
        resp = self.client.patch(url, {'hook': 'after'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        row.refresh_from_db()
        self.assertEqual(row.hook, 'after')

    def test_delete(self):
        row = AdCopyVariation.objects.create(
            creative=self.creative,
            source_mode='existing',
            created_by=self.user,
        )
        url = reverse('ad-copy-variation-detail', args=[row.id])
        resp = self.client.delete(url)
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(AdCopyVariation.objects.filter(pk=row.id).exists())

    def test_create_sets_created_by_to_request_user(self):
        url = reverse('ad-copy-variation-list')
        resp = self.client.post(url, self._payload(), format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        row = AdCopyVariation.objects.get(pk=resp.data['id'])
        self.assertEqual(row.created_by_id, self.user.id)

    def test_filter_by_creative(self):
        other_creative = _make_creative(
            _make_user(username='other', email='other@example.com'),
            meta_creative_id='cra-2',
        )
        AdCopyVariation.objects.create(
            creative=self.creative, source_mode='existing', created_by=self.user,
        )
        AdCopyVariation.objects.create(
            creative=other_creative, source_mode='existing',
        )
        url = reverse('ad-copy-variation-list')
        resp = self.client.get(url, {'creative': self.creative.id})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        body = resp.data
        results = body['results'] if isinstance(body, dict) and 'results' in body else body
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['creative'], self.creative.id)


class GenerateFromExistingTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = _make_user(username='gen_existing')
        cls.creative = _make_creative(cls.user, meta_creative_id='gex-1')

    def setUp(self):
        self.client.force_authenticate(user=self.user)
        self.url = reverse('ad-copy-variation-generate')

    @patch('ad_copy_variation.services.call_aistudio_json')
    def test_returns_json_shape(self, mock_call):
        mock_call.return_value = _FAKE_GEMINI_RESPONSE
        resp = self.client.post(
            self.url,
            {
                'source_mode': 'existing',
                'creative_id': self.creative.id,
                'instruction': 'shorten the hook',
            },
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.assertEqual(set(resp.data.keys()), {'hook', 'headline', 'description', 'cta'})
        self.assertEqual(resp.data['hook'], 'Generated hook line')
        self.assertEqual(mock_call.call_count, 1)

    @patch('ad_copy_variation.services.call_aistudio_json')
    def test_does_not_persist(self, mock_call):
        mock_call.return_value = _FAKE_GEMINI_RESPONSE
        before = AdCopyVariation.objects.count()
        resp = self.client.post(
            self.url,
            {'source_mode': 'existing', 'creative_id': self.creative.id},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(AdCopyVariation.objects.count(), before)

    @patch('ad_copy_variation.services.call_aistudio_json')
    def test_template_is_built_from_creative(self, mock_call):
        mock_call.return_value = _FAKE_GEMINI_RESPONSE
        self.client.post(
            self.url,
            {'source_mode': 'existing', 'creative_id': self.creative.id},
            format='json',
        )
        _, user_prompt = mock_call.call_args.args
        self.assertIn('Hook line', user_prompt)
        self.assertIn('Headline A', user_prompt)
        self.assertIn('SHOP_NOW', user_prompt)


class GenerateFromCustomTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = _make_user(username='gen_custom')

    def setUp(self):
        self.client.force_authenticate(user=self.user)
        self.url = reverse('ad-copy-variation-generate')

    @patch('ad_copy_variation.services.call_aistudio_json')
    def test_returns_json_shape(self, mock_call):
        mock_call.return_value = _FAKE_GEMINI_RESPONSE
        resp = self.client.post(
            self.url,
            {
                'source_mode': 'custom',
                'base_copy': {
                    'hook': 'My hook',
                    'headline': 'My headline',
                    'description': 'My desc',
                    'cta': 'SUBSCRIBE',
                },
                'instruction': 'make it punchier',
            },
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.assertEqual(set(resp.data.keys()), {'hook', 'headline', 'description', 'cta'})
        self.assertEqual(mock_call.call_count, 1)
        _, user_prompt = mock_call.call_args.args
        self.assertIn('My hook', user_prompt)
        self.assertIn('SUBSCRIBE', user_prompt)


class GenerateFromExternalUrlTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = _make_user(username='gen_external')

    def setUp(self):
        self.client.force_authenticate(user=self.user)
        self.url = reverse('ad-copy-variation-generate')

    @patch('ad_copy_variation.services.call_aistudio_json')
    @patch('ad_copy_variation.services.fetch_url_text')
    def test_happy_path(self, mock_fetch, mock_llm):
        mock_fetch.return_value = 'rendered ad page text with hook + body + cta'
        mock_llm.return_value = _FAKE_GEMINI_RESPONSE
        resp = self.client.post(
            self.url,
            {
                'source_mode': 'external_url',
                'url': 'https://example.com/test',
                'instruction': 'shorter',
            },
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.assertEqual(set(resp.data.keys()), {'hook', 'headline', 'description', 'cta'})
        self.assertEqual(mock_fetch.call_count, 1)
        self.assertEqual(mock_llm.call_count, 1)
        # Generate is preview-only — no row should be persisted.
        self.assertFalse(AdCopyVariation.objects.filter(source_mode='external_url').exists())

    @patch('ad_copy_variation.services.call_aistudio_json')
    @patch('ad_copy_variation.services.fetch_url_text')
    def test_missing_url(self, mock_fetch, mock_llm):
        resp = self.client.post(
            self.url,
            {'source_mode': 'external_url'},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        mock_fetch.assert_not_called()
        mock_llm.assert_not_called()

    @patch('ad_copy_variation.services.call_aistudio_json')
    @patch('ad_copy_variation.services.fetch_url_text')
    def test_invalid_url_scheme(self, mock_fetch, mock_llm):
        resp = self.client.post(
            self.url,
            {'source_mode': 'external_url', 'url': 'ftp://example.com/x'},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        mock_fetch.assert_not_called()
        mock_llm.assert_not_called()

    @patch('ad_copy_variation.services.call_aistudio_json')
    @patch('ad_copy_variation.services.fetch_url_text')
    def test_fetch_failure_returns_502(self, mock_fetch, mock_llm):
        mock_fetch.side_effect = RuntimeError('Browserless fetch failed: status=500')
        resp = self.client.post(
            self.url,
            {'source_mode': 'external_url', 'url': 'https://example.com/test'},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_502_BAD_GATEWAY)
        self.assertIn('error', resp.data)
        mock_llm.assert_not_called()

    @patch('ad_copy_variation.services.call_aistudio_json')
    @patch('ad_copy_variation.services.fetch_url_text')
    def test_llm_failure_returns_502(self, mock_fetch, mock_llm):
        mock_fetch.return_value = 'rendered text'
        mock_llm.side_effect = RuntimeError('AI Studio call failed: status=429')
        resp = self.client.post(
            self.url,
            {'source_mode': 'external_url', 'url': 'https://example.com/test'},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_502_BAD_GATEWAY)
        self.assertIn('error', resp.data)


class GenerateBadInputTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = _make_user(username='gen_bad')

    def setUp(self):
        self.client.force_authenticate(user=self.user)
        self.url = reverse('ad-copy-variation-generate')

    @patch('ad_copy_variation.services.call_aistudio_json')
    def test_missing_creative_id_for_existing(self, mock_call):
        resp = self.client.post(
            self.url,
            {'source_mode': 'existing'},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        mock_call.assert_not_called()

    @patch('ad_copy_variation.services.call_aistudio_json')
    def test_unknown_source_mode(self, mock_call):
        resp = self.client.post(
            self.url,
            {'source_mode': 'banana'},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        mock_call.assert_not_called()


class PermissionTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = _make_user(username='perm_user')
        cls.creative = _make_creative(cls.user, meta_creative_id='perm-1')
        cls.row = AdCopyVariation.objects.create(
            creative=cls.creative,
            source_mode='existing',
            created_by=cls.user,
        )

    def test_list_unauthenticated(self):
        resp = self.client.get(reverse('ad-copy-variation-list'))
        self.assertIn(resp.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_detail_unauthenticated(self):
        resp = self.client.get(reverse('ad-copy-variation-detail', args=[self.row.id]))
        self.assertIn(resp.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_create_unauthenticated(self):
        resp = self.client.post(
            reverse('ad-copy-variation-list'),
            {'source_mode': 'existing', 'creative': self.creative.id},
            format='json',
        )
        self.assertIn(resp.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_generate_unauthenticated(self):
        resp = self.client.post(
            reverse('ad-copy-variation-generate'),
            {'source_mode': 'custom', 'base_copy': {}},
            format='json',
        )
        self.assertIn(resp.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))
