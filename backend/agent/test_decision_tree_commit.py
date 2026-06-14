"""Tests for decision_tree_service.commit_decision_tree."""
import pytest
from django.contrib.auth import get_user_model

from core.models import Organization, Project, ProjectMember
from decision.models import Decision, DecisionEdge

from .decision_tree_service import commit_decision_tree

User = get_user_model()


@pytest.fixture
def tree_project_user(db):
    org = Organization.objects.create(name='Tree Org', slug='tree-org')
    user = User.objects.create_user(
        username='treeuser',
        email='treeuser@test.com',
        password='x',
        organization=org,
    )
    user.organization = org
    user.save()
    project = Project.objects.create(
        name='Tree Proj',
        organization=org,
        owner=user,
    )
    ProjectMember.objects.create(project=project, user=user, is_active=True)
    return project, user


def _sample_tree():
    return {
        'nodes': [
            {
                'ref': 'root',
                'layer': 0,
                'title': 'Reallocate Meta budget?',
                'context_summary': 'ROAS dropped.',
                'risk_level': 'MEDIUM',
                'confidence': 3,
                'parent_refs': [],
            },
            {
                'ref': 'child_a',
                'layer': 1,
                'title': 'Pause underperforming ad sets',
                'parent_refs': ['root'],
            },
            {
                'ref': 'child_b',
                'layer': 1,
                'title': 'Shift budget to prospecting',
                'parent_refs': ['root'],
            },
        ],
    }


@pytest.mark.django_db
def test_commit_decision_tree_creates_nodes_and_edges(tree_project_user):
    project, user = tree_project_user
    result = commit_decision_tree(project=project, user=user, tree=_sample_tree())

    assert len(result['decision_ids']) == 3
    assert len(result['created_decisions']) == 3

    decisions = Decision.objects.filter(project=project).order_by('project_seq')
    assert decisions.count() == 3
    root = decisions.get(title='Reallocate Meta budget?')
    assert root.created_by_agent is True
    assert root.risk_level == 'MEDIUM'
    assert root.confidence == 3

    child_edges = DecisionEdge.objects.filter(from_decision=root)
    assert child_edges.count() == 2
    child_ids = {edge.to_decision_id for edge in child_edges}
    assert child_ids == {
        decisions.get(title='Pause underperforming ad sets').id,
        decisions.get(title='Shift budget to prospecting').id,
    }


@pytest.mark.django_db
def test_commit_decision_tree_empty_nodes_noop(tree_project_user):
    project, user = tree_project_user
    result = commit_decision_tree(project=project, user=user, tree={'nodes': []})
    assert result['decision_ids'] == []
    assert Decision.objects.filter(project=project).count() == 0


@pytest.mark.django_db
def test_commit_decision_tree_multi_parent_dag(tree_project_user):
    project, user = tree_project_user
    tree = {
        'nodes': [
            {'ref': 'a', 'layer': 0, 'title': 'Parent A', 'parent_refs': []},
            {'ref': 'b', 'layer': 0, 'title': 'Parent B', 'parent_refs': []},
            {
                'ref': 'c',
                'layer': 1,
                'title': 'Child C',
                'parent_refs': ['a', 'b'],
            },
        ],
    }
    result = commit_decision_tree(project=project, user=user, tree=tree)
    assert len(result['decision_ids']) == 3

    child = Decision.objects.get(title='Child C')
    parents = {
        edge.from_decision.title
        for edge in DecisionEdge.objects.filter(to_decision=child)
    }
    assert parents == {'Parent A', 'Parent B'}
