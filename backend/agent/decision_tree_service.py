"""Persist agent-generated decision trees as Decision + DecisionEdge records."""
from __future__ import annotations

from django.db import transaction

from decision.models import Decision, DecisionEdge
from decision.services import infer_decision_topic, validate_decision_edge


def commit_decision_tree(
    *,
    project,
    user,
    tree: dict,
    agent_session_id=None,
) -> dict:
    """
    Create draft Decision nodes and FOLLOW_UP edges from a validated tree payload.

    Returns:
        {
            'decision_ids': [int, ...],
            'created_decisions': [{'ref', 'decision_id', 'title', 'layer'}, ...],
        }
    """
    nodes = tree.get('nodes') or []
    if not nodes:
        return {'decision_ids': [], 'created_decisions': []}

    sorted_nodes = sorted(nodes, key=lambda n: (n['layer'], n['ref']))
    ref_to_decision: dict[str, Decision] = {}
    created_decisions: list[dict] = []

    with transaction.atomic():
        existing_topics = set(
            Decision.objects.filter(project=project, is_deleted=False)
            .values_list('topic', flat=True)
        )

        for node in sorted_nodes:
            title = (node.get('title') or '')[:255]
            topic = node.get('topic')
            if topic:
                topic = str(topic)[:64]
            else:
                topic = infer_decision_topic(title, existing_topics=existing_topics)

            decision = Decision.objects.create(
                title=title,
                context_summary=node.get('context_summary') or None,
                reasoning=node.get('reasoning') or None,
                risk_level=node.get('risk_level') or None,
                confidence=node.get('confidence'),
                topic=topic,
                project=project,
                author=user,
                last_edited_by=user,
                created_by_agent=True,
                agent_session_id=agent_session_id,
            )
            existing_topics.add(topic)
            ref_to_decision[node['ref']] = decision
            created_decisions.append({
                'ref': node['ref'],
                'decision_id': decision.id,
                'title': title,
                'layer': node['layer'],
            })

        for node in sorted_nodes:
            child = ref_to_decision[node['ref']]
            for parent_ref in node.get('parent_refs') or []:
                parent = ref_to_decision[parent_ref]
                validate_decision_edge(parent, child)
                DecisionEdge.objects.create(
                    from_decision=parent,
                    to_decision=child,
                    created_by=user,
                    edge_type=DecisionEdge.EdgeType.FOLLOW_UP,
                )

    decision_ids = [entry['decision_id'] for entry in created_decisions]
    return {
        'decision_ids': decision_ids,
        'created_decisions': created_decisions,
    }
