import pytest
from django.contrib.auth import get_user_model

from core.models import Organization, Project, ProjectMember
from decision.models import Decision
from task.models import Task

from .approval_gate import KIND_TASK, request_external_commit, resolve_pending
from .models import AgentPendingExternalApproval, AgentSession, AgentWorkflowRun
from .services import AgentOrchestrator

User = get_user_model()


@pytest.fixture
def approval_org_project_user(db):
    org = Organization.objects.create(name='Apr Org', slug='apr-org')
    user = User.objects.create_user(
        username='apruser',
        email='apruser@test.com',
        password='x',
        organization=org,
    )
    user.organization = org
    user.save()
    project = Project.objects.create(
        name='Apr Proj',
        organization=org,
        owner=user,
    )
    ProjectMember.objects.create(project=project, user=user, is_active=True)
    return org, project, user


@pytest.mark.django_db
def test_request_external_commit_auto_creates_tasks(approval_org_project_user):
    _org, project, user = approval_org_project_user
    session = AgentSession.objects.create(user=user, project=project, approval_required=False)
    wf = AgentWorkflowRun.objects.create(session=session, status='analyzing')
    decision = Decision.objects.create(
        title='D',
        project=project,
        project_seq=1,
        author=user,
    )
    wf.decision = decision
    wf.save()
    orch = AgentOrchestrator(user, project, session)
    draft = {
        'recommended_tasks': [
            {'summary': 'T1', 'description': 'd', 'type': 'execution', 'priority': 'LOW'},
        ],
    }
    ctx = {
        'input_data': {'analysis_result': {'recommended_tasks': draft['recommended_tasks']}},
        'analysis_result': {'recommended_tasks': draft['recommended_tasks']},
        'decision_id': decision.id,
    }
    gate = request_external_commit(
        orchestrator=orch,
        workflow_run=wf,
        step_execution=None,
        kind=KIND_TASK,
        draft=draft,
        commit_context=ctx,
    )
    assert gate.paused is False
    assert gate.workflow_run_patch.get('created_tasks')
    assert gate.sse_events
    ev = next((e for e in gate.sse_events if e.get('type') == 'task_created'), None)
    assert ev is not None
    data = ev.get('data') or {}
    assert isinstance(data.get('created_tasks'), list)
    assert data['created_tasks'][0]['index'] == 0
    assert data['created_tasks'][0]['summary'] == 'T1'
    assert isinstance(data['created_tasks'][0]['task_id'], int)
    assert not AgentPendingExternalApproval.objects.filter(session=session).exists()


@pytest.mark.django_db
def test_request_external_commit_creates_pending_when_required(approval_org_project_user):
    _org, project, user = approval_org_project_user
    session = AgentSession.objects.create(user=user, project=project, approval_required=True)
    wf = AgentWorkflowRun.objects.create(session=session, status='analyzing')
    orch = AgentOrchestrator(user, project, session)
    draft = {'recommended_tasks': [{'summary': 'T', 'type': 'execution', 'priority': 'LOW'}]}
    ctx = {'input_data': {}, 'analysis_result': draft, 'decision_id': None}
    gate = request_external_commit(
        orchestrator=orch,
        workflow_run=wf,
        step_execution=None,
        kind=KIND_TASK,
        draft=draft,
        commit_context=ctx,
    )
    assert gate.paused is True
    assert AgentPendingExternalApproval.objects.filter(session=session, status='pending').exists()
    assert gate.sse_events
    ev = gate.sse_events[0]
    assert ev.get('type') == 'approval_request'
    data = ev.get('data') or {}
    assert data.get('approval_id')
    assert data.get('kind') == KIND_TASK
    assert isinstance(data.get('draft'), dict)


@pytest.mark.django_db
def test_resolve_pending_reject(approval_org_project_user):
    _org, project, user = approval_org_project_user
    session = AgentSession.objects.create(user=user, project=project, approval_required=True)
    wf = AgentWorkflowRun.objects.create(session=session, status='analyzing')
    pending = AgentPendingExternalApproval.objects.create(
        session=session,
        workflow_run=wf,
        step_execution=None,
        kind=KIND_TASK,
        status='pending',
        draft={'recommended_tasks': []},
        commit_context={'input_data': {}, 'analysis_result': {}, 'decision_id': None},
        destination_options=[],
        default_destination=None,
    )
    orch = AgentOrchestrator(user, project, session)
    result = resolve_pending(
        orchestrator=orch,
        pending_id=str(pending.id),
        decision='reject',
        draft={},
        destination=None,
    )
    assert any('rejected' in (e.get('content') or '') for e in result.sse_events)
    pending.refresh_from_db()
    assert pending.status == 'rejected'


@pytest.mark.django_db
def test_resolve_pending_task_can_override_recommended_tasks_and_preserve_indexes(approval_org_project_user):
    _org, project, user = approval_org_project_user
    session = AgentSession.objects.create(user=user, project=project, approval_required=True)
    wf = AgentWorkflowRun.objects.create(session=session, status='analyzing')
    decision = Decision.objects.create(
        title='D',
        project=project,
        project_seq=1,
        author=user,
    )
    wf.decision = decision
    wf.save()

    orch = AgentOrchestrator(user, project, session)
    base_tasks = [
        {'summary': 'T0', 'description': 'd0', 'type': 'execution', 'priority': 'LOW'},
        {'summary': 'T1', 'description': 'd1', 'type': 'execution', 'priority': 'LOW'},
        {'summary': 'T2', 'description': 'd2', 'type': 'execution', 'priority': 'LOW'},
    ]
    ctx = {
        'input_data': {'analysis_result': {'recommended_tasks': base_tasks}},
        'analysis_result': {'recommended_tasks': base_tasks},
        'decision_id': decision.id,
    }
    gate = request_external_commit(
        orchestrator=orch,
        workflow_run=wf,
        step_execution=None,
        kind=KIND_TASK,
        draft={'recommended_tasks': base_tasks},
        commit_context=ctx,
    )
    assert gate.paused is True
    approval_id = gate.pending_id
    assert approval_id

    # Select only tasks 0 and 2 and preserve their original indexes.
    override = [
        {**base_tasks[0], 'index': 0},
        {**base_tasks[2], 'index': 2},
    ]
    before_count = Task.objects.filter(project=project, owner=user).count()
    result = resolve_pending(
        orchestrator=orch,
        pending_id=str(approval_id),
        decision='approve',
        draft={'recommended_tasks': override},
        destination=None,
    )
    assert result.paused is False
    ev = next((e for e in result.sse_events if e.get('type') == 'task_created'), None)
    assert ev is not None
    data = ev.get('data') or {}
    created = data.get('created_tasks') or []
    assert len(created) == 2
    assert {c.get('index') for c in created} == {0, 2}

    after_count = Task.objects.filter(project=project, owner=user).count()
    assert after_count - before_count == 2
