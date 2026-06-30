"""Quick reply template library (MED-213) — targeted API tests.

Covers the acceptance criteria most at risk plus the cross-tenant create check:
- AC1: creating requires at least one tag
- AC4: every edit is recorded in history with the editor
- AC5: a team-scoped template is hidden from non-members of that team
- Security: a user cannot create a template in an organisation they don't belong to
"""
import pytest
from core.models import Team
from csm.models import CustomerUser, QuickReplyTemplate, QuickReplyTemplateHistory

pytestmark = pytest.mark.django_db

URL = '/api/csm/templates/'


def _rows(response):
    """Normalise list responses whether or not pagination is enabled."""
    data = response.data
    if isinstance(data, dict) and 'results' in data:
        return data['results']
    return data


def _member(user, org, *, team=None, user_type='agent'):
    return CustomerUser.objects.create(
        user=user, organisation=org, team=team,
        user_type=user_type, is_active=True,
    )


# --- Security: cross-tenant create -----------------------------------------

def test_create_rejected_for_non_member_org(api_client, user2, customer_organisation):
    api_client.force_authenticate(user2)  # user2 has no CustomerUser in the org
    resp = api_client.post(URL, {
        'organisation': customer_organisation.id,
        'title': 'X', 'content': 'hi', 'tags': ['greeting'],
    }, format='json')
    assert resp.status_code == 400
    assert 'organisation' in resp.data


def test_create_allowed_for_member(api_client, user, customer_organisation):
    _member(user, customer_organisation)
    api_client.force_authenticate(user)
    resp = api_client.post(URL, {
        'organisation': customer_organisation.id,
        'title': 'Welcome', 'content': 'hi there', 'tags': ['greeting'],
    }, format='json')
    assert resp.status_code == 201, resp.data
    assert resp.data['created_by'] == user.id


# --- AC1: at least one tag --------------------------------------------------

def test_create_requires_at_least_one_tag(api_client, user, customer_organisation):
    _member(user, customer_organisation)
    api_client.force_authenticate(user)
    resp = api_client.post(URL, {
        'organisation': customer_organisation.id,
        'title': 'No tags', 'content': 'body', 'tags': [],
    }, format='json')
    assert resp.status_code == 400
    assert 'tags' in resp.data


# --- AC5: team-scoped visibility -------------------------------------------

def test_team_scoped_template_hidden_from_non_team_members(
    api_client, user, user2, organization, customer_organisation,
):
    team = Team.objects.create(organization=organization, name='Frontline')
    _member(user, customer_organisation, team=team)       # in the team
    _member(user2, customer_organisation, team=None)      # member of org, not team

    workspace = QuickReplyTemplate.objects.create(
        organisation=customer_organisation, title='WS', content='x', tags=['a'],
    )
    team_only = QuickReplyTemplate.objects.create(
        organisation=customer_organisation, title='TeamOnly', content='y',
        tags=['b'], team=team,
    )

    api_client.force_authenticate(user)
    ids_member = {t['id'] for t in _rows(api_client.get(URL, {'organisation': customer_organisation.id}))}
    assert {workspace.id, team_only.id} <= ids_member

    api_client.force_authenticate(user2)
    ids_outsider = {t['id'] for t in _rows(api_client.get(URL, {'organisation': customer_organisation.id}))}
    assert workspace.id in ids_outsider
    assert team_only.id not in ids_outsider


# --- AC4: edit history ------------------------------------------------------

def test_edit_records_history_with_editor(api_client, user, customer_organisation):
    _member(user, customer_organisation, user_type='admin')
    tmpl = QuickReplyTemplate.objects.create(
        organisation=customer_organisation, title='Orig', content='old',
        tags=['a'], created_by=user,
    )
    api_client.force_authenticate(user)
    resp = api_client.patch(f'{URL}{tmpl.id}/', {'title': 'New', 'content': 'new'}, format='json')
    assert resp.status_code == 200, resp.data

    history = QuickReplyTemplateHistory.objects.filter(template=tmpl)
    assert history.count() == 1
    snapshot = history.first()
    assert snapshot.title == 'Orig'        # snapshot of the pre-edit state
    assert snapshot.content == 'old'
    assert snapshot.edited_by_id == user.id

    rows = _rows(api_client.get(f'{URL}{tmpl.id}/history/'))
    assert len(rows) == 1
    assert rows[0]['edited_by_name']
