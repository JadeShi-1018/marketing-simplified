"""Confirm orchestration (blueprint → seeded project entities)."""

from __future__ import annotations

import logging
from typing import Any, Mapping

from django.contrib.auth import get_user_model

from core.services.quick_start.blueprint import normalize_selected_modules
from core.services.quick_start.seeder import QuickStartProjectSeeder
from core.services.quick_start.validation import validate_and_normalize_blueprint

logger = logging.getLogger(__name__)
User = get_user_model()


class QuickStartConfirmService:
    """Creates project + seeded artifacts from a confirmed blueprint."""

    def confirm(
        self,
        *,
        user: User,
        blueprint: Mapping[str, Any],
        project_title: str | None = None,
        selected_modules: Mapping[str, bool] | None = None,
    ) -> dict[str, Any]:
        """Persist project and enabled modules inside a transaction."""
        modules = normalize_selected_modules(selected_modules)
        normalized = validate_and_normalize_blueprint(blueprint, modules)

        result = QuickStartProjectSeeder.seed_blueprint(
            user=user,
            blueprint=normalized,
            project_title=project_title,
            selected_modules=modules,
        )

        return {
            'project': {
                'id': result.project.id,
                'name': result.project.name,
                'is_active': True,
            },
            'created': {
                'task_ids': list(result.task_ids),
                'spreadsheet_ids': list(result.spreadsheet_ids),
                'calendar_event_ids': list(result.calendar_event_ids),
                'decision_ids': list(result.decision_ids),
                'miro_board_ids': list(result.miro_board_ids),
            },
            'summary': {
                'tasks': len(result.task_ids),
                'spreadsheets': len(result.spreadsheet_ids),
                'calendar_events': len(result.calendar_event_ids),
                'decisions': len(result.decision_ids),
                'miro_boards': len(result.miro_board_ids),
            },
        }
