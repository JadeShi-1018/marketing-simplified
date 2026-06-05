"""Persist Quick Start blueprint data into the database (incremental by phase)."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Mapping
from uuid import UUID

from django.utils.dateparse import parse_date

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils.dateparse import parse_datetime

from core.models import Project, ProjectMember
from core.services.project_initialization import ProjectInitializationService
from calendars.models import Calendar, Event
from decision.models import Decision
from miro.models import Board, BoardItem
from miro.serializers import generate_share_token
from core.services.quick_start.constants import (
    MIN_CALENDAR_EVENTS_WHEN_ENABLED,
    MIN_TASKS_WHEN_ENABLED,
    MODULE_CALENDAR,
    MODULE_DECISIONS,
    MODULE_MIRO,
    MODULE_SPREADSHEET,
    MODULE_TASKS,
)
from core.services.quick_start.exceptions import QuickStartValidationError
from core.services.quick_start.validation import TASK_TYPES
from core.utils.project_calendars import ensure_project_calendar
from spreadsheet.models import Cell, CellValueType, SheetColumn
from spreadsheet.services import CellService, SheetService, SpreadsheetService
from task.models import Task

logger = logging.getLogger(__name__)
User = get_user_model()


def _coerce_optional_date(value: Any) -> date | None:
    """Blueprint dates are validated as YYYY-MM-DD strings; Task fields need date objects."""
    if value is None or value == '':
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, str):
        return parse_date(value.strip())
    return None


@dataclass(frozen=True)
class ProjectSeedResult:
    """Outcome of Quick Start project seeding."""

    project: Project
    calendar_id: str
    task_ids: tuple[int, ...] = ()
    spreadsheet_ids: tuple[int, ...] = ()
    calendar_event_ids: tuple[str, ...] = ()
    decision_ids: tuple[int, ...] = ()
    miro_board_ids: tuple[str, ...] = ()


class QuickStartProjectSeeder:
    """
    Creates the project shell: Project, owner membership, project calendar, active project.

    Tasks, spreadsheets, and calendar events are added in qs-2.1b–2.1d.
    """

    @staticmethod
    @transaction.atomic
    def seed_project(
        *,
        user: User,
        blueprint: Mapping[str, Any],
        project_title: str | None = None,
    ) -> ProjectSeedResult:
        organization = getattr(user, 'organization', None)
        if not organization:
            raise QuickStartValidationError(
                'User must belong to an organization to create projects.'
            )

        project_data = blueprint.get('project')
        if not isinstance(project_data, Mapping):
            raise QuickStartValidationError('blueprint.project is required.')

        name = (project_title or project_data.get('name') or '').strip()
        if not name:
            raise QuickStartValidationError('project.name is required.')

        project = Project.objects.create(
            name=name[:200],
            description=project_data.get('description') or None,
            organization=organization,
            owner=user,
            project_type=list(project_data.get('project_type') or []),
            work_model=list(project_data.get('work_model') or []),
            advertising_platforms=list(project_data.get('advertising_platforms') or []),
            objectives=list(project_data.get('objectives') or []),
            kpis=dict(project_data.get('kpis') or {}),
        )

        ProjectMember.objects.update_or_create(
            user=user,
            project=project,
            defaults={'role': 'owner', 'is_active': True},
        )

        calendar = ensure_project_calendar(project)

        user.active_project = project
        user.save(update_fields=['active_project'])

        try:
            ProjectInitializationService.initialize_project(project)
        except Exception as exc:  # pragma: no cover - safeguard
            logger.warning(
                'Quick Start project initialization failed for project %s: %s',
                project.id,
                exc,
            )

        return ProjectSeedResult(
            project=project,
            calendar_id=str(calendar.id),
            task_ids=(),
            spreadsheet_ids=(),
            calendar_event_ids=(),
        )

    @staticmethod
    def seed_tasks(
        *,
        project: Project,
        user: User,
        tasks: list[Mapping[str, Any]],
    ) -> list[int]:
        """Create tasks from validated blueprint task entries (qs-2.1b)."""
        if not tasks:
            return []

        created_ids: list[int] = []
        for index, row in enumerate(tasks):
            if not isinstance(row, Mapping):
                raise QuickStartValidationError(f'tasks[{index}] must be an object.')

            summary = str(row.get('summary') or '').strip()
            task_type = row.get('type')
            if not summary or task_type not in TASK_TYPES:
                raise QuickStartValidationError(f'tasks[{index}] has invalid summary or type.')

            priority = row.get('priority') or Task.Priority.MEDIUM
            if priority not in Task.Priority.values:
                priority = Task.Priority.MEDIUM

            task = Task.objects.create(
                summary=summary[:255],
                description=row.get('description') or None,
                type=task_type,
                priority=priority,
                status=Task.Status.DRAFT,
                project=project,
                owner=user,
                created_by=user,
                due_date=_coerce_optional_date(row.get('due_date')),
                planned_start_date=_coerce_optional_date(row.get('planned_start_date')),
                order_in_project=index,
            )
            created_ids.append(task.id)

        return created_ids

    @staticmethod
    def seed_spreadsheets(
        *,
        project: Project,
        spreadsheets: list[Mapping[str, Any]],
    ) -> list[int]:
        """Create spreadsheets, sheets, columns, and cell values (qs-2.1c)."""
        if not spreadsheets:
            return []

        created_ids: list[int] = []
        for ss_index, item in enumerate(spreadsheets):
            if not isinstance(item, Mapping):
                raise QuickStartValidationError(f'spreadsheets[{ss_index}] must be an object.')

            ss_name = str(item.get('name') or '').strip()
            if not ss_name:
                raise QuickStartValidationError(f'spreadsheets[{ss_index}].name is required.')

            spreadsheet = SpreadsheetService.create_spreadsheet(project=project, name=ss_name[:200])
            created_ids.append(spreadsheet.id)

            sheets = item.get('sheets') or []
            if not isinstance(sheets, list) or not sheets:
                raise QuickStartValidationError(f'spreadsheets[{ss_index}] must include at least one sheet.')

            for sh_index, sheet_item in enumerate(sheets):
                if not isinstance(sheet_item, Mapping):
                    raise QuickStartValidationError(
                        f'spreadsheets[{ss_index}].sheets[{sh_index}] must be an object.'
                    )
                sheet_name = str(sheet_item.get('name') or '').strip()
                if not sheet_name:
                    raise QuickStartValidationError(
                        f'spreadsheets[{ss_index}].sheets[{sh_index}].name is required.'
                    )

                columns = list(sheet_item.get('columns') or [])
                rows = list(sheet_item.get('rows') or [])
                if len(columns) < 3:
                    raise QuickStartValidationError(
                        f'spreadsheets[{ss_index}].sheets[{sh_index}] needs at least 3 columns.'
                    )

                sheet = SheetService.create_sheet(spreadsheet=spreadsheet, name=sheet_name[:200])
                row_count = max(len(rows), 1)
                column_count = len(columns)
                SheetService.resize_sheet(sheet, row_count=row_count, column_count=column_count)

                for col in columns:
                    if not isinstance(col, Mapping):
                        continue
                    position = col.get('position')
                    name = str(col.get('name') or '').strip()
                    if not isinstance(position, int) or not name:
                        continue
                    SheetColumn.objects.filter(
                        sheet=sheet,
                        position=position,
                        is_deleted=False,
                    ).update(name=name[:200])

                operations: list[dict[str, Any]] = []
                for row_index, row in enumerate(rows):
                    if not isinstance(row, list):
                        continue
                    for col_index, cell_value in enumerate(row):
                        if col_index >= column_count:
                            break
                        text = str(cell_value)
                        if text == '':
                            continue
                        operations.append(
                            {
                                'operation': 'set',
                                'row': row_index,
                                'column': col_index,
                                'raw_input': text,
                            }
                        )

                if operations:
                    CellService.batch_update_cells(sheet, operations, auto_expand=True)

        return created_ids

    @staticmethod
    def _parse_event_datetime(value: str) -> datetime:
        parsed = parse_datetime(value.replace('Z', '+00:00'))
        if parsed is None:
            raise QuickStartValidationError('Invalid ISO-8601 datetime.')
        return parsed

    @staticmethod
    def seed_calendar_events(
        *,
        project: Project,
        user: User,
        calendar_id: str,
        events: list[Mapping[str, Any]],
    ) -> list[str]:
        """Create calendar events on the project calendar (qs-2.1d)."""
        if not events:
            return []

        try:
            calendar_uuid = UUID(str(calendar_id))
        except (TypeError, ValueError) as exc:
            raise QuickStartValidationError('calendar_id must be a valid UUID.') from exc

        try:
            calendar = Calendar.objects.get(id=calendar_uuid, project=project, is_deleted=False)
        except Calendar.DoesNotExist as exc:
            raise QuickStartValidationError('Project calendar not found.') from exc

        created_ids: list[str] = []
        for index, row in enumerate(events):
            if not isinstance(row, Mapping):
                raise QuickStartValidationError(f'calendar_events[{index}] must be an object.')

            title = str(row.get('title') or '').strip()
            if not title:
                raise QuickStartValidationError(f'calendar_events[{index}].title is required.')

            start = QuickStartProjectSeeder._parse_event_datetime(
                str(row.get('start_datetime') or '')
            )
            end = QuickStartProjectSeeder._parse_event_datetime(str(row.get('end_datetime') or ''))

            event = Event.objects.create(
                organization=project.organization,
                calendar=calendar,
                created_by=user,
                title=title[:500],
                description=row.get('description') or None,
                start_datetime=start,
                end_datetime=end,
                timezone=row.get('timezone') or 'UTC',
                is_all_day=bool(row.get('is_all_day', False)),
            )
            created_ids.append(str(event.id))

        return created_ids

    @staticmethod
    def seed_decisions(
        *,
        project: Project,
        user: User,
        decisions: list[Mapping[str, Any]],
    ) -> list[int]:
        """Create DRAFT decisions from validated blueprint entries."""
        if not decisions:
            return []

        created_ids: list[int] = []
        for index, row in enumerate(decisions):
            if not isinstance(row, Mapping):
                raise QuickStartValidationError(f'decisions[{index}] must be an object.')

            title = str(row.get('title') or '').strip()
            if not title:
                raise QuickStartValidationError(f'decisions[{index}].title is required.')

            decision = Decision(
                title=title[:255],
                context_summary=row.get('description') or None,
                status=Decision.Status.DRAFT,
                project=project,
                author=user,
                last_edited_by=user,
            )
            decision.save()
            created_ids.append(decision.id)

        return created_ids

    @staticmethod
    def seed_miro_boards(
        *,
        project: Project,
        boards: list[Mapping[str, Any]],
    ) -> list[str]:
        """Create Miro boards with simple sticky-note items from the blueprint."""
        if not boards:
            return []

        created_ids: list[str] = []
        for index, row in enumerate(boards):
            if not isinstance(row, Mapping):
                raise QuickStartValidationError(f'miro_boards[{index}] must be an object.')

            name = str(row.get('name') or '').strip()
            if not name:
                raise QuickStartValidationError(f'miro_boards[{index}].name is required.')

            share_token = generate_share_token()
            while Board.objects.filter(share_token=share_token).exists():
                share_token = generate_share_token()

            board = Board.objects.create(
                project=project,
                title=name[:200],
                share_token=share_token,
            )
            sticky_notes = list(row.get('sticky_notes') or [])
            for note_index, note in enumerate(sticky_notes):
                if not isinstance(note, Mapping):
                    continue
                content = str(note.get('content') or '').strip()
                if not content:
                    continue
                BoardItem.objects.create(
                    board=board,
                    type=BoardItem.ItemType.STICKY_NOTE,
                    x=float(note.get('x', 80)),
                    y=float(note.get('y', 80)),
                    width=float(note.get('width', 200)),
                    height=float(note.get('height', 120)),
                    content=content[:2000],
                    z_index=note_index,
                    style={'backgroundColor': '#FEF08A'},
                )
            created_ids.append(str(board.id))

        return created_ids

    @staticmethod
    @transaction.atomic
    def seed_blueprint(
        *,
        user: User,
        blueprint: Mapping[str, Any],
        project_title: str | None = None,
        selected_modules: Mapping[str, bool] | None = None,
    ) -> ProjectSeedResult:
        """
        Create project shell and all enabled MVP modules from a validated blueprint.
        """
        from core.services.quick_start.blueprint import normalize_selected_modules

        modules = normalize_selected_modules(selected_modules)
        base = QuickStartProjectSeeder.seed_project(
            user=user,
            blueprint=blueprint,
            project_title=project_title,
        )

        task_ids: list[int] = []
        if modules.get(MODULE_TASKS, True):
            task_payloads = list(blueprint.get('tasks') or [])
            if task_payloads and len(task_payloads) < MIN_TASKS_WHEN_ENABLED:
                raise QuickStartValidationError(
                    f'At least {MIN_TASKS_WHEN_ENABLED} tasks are required when tasks module is enabled.'
                )
            task_ids = QuickStartProjectSeeder.seed_tasks(
                project=base.project,
                user=user,
                tasks=task_payloads,
            )

        spreadsheet_ids: list[int] = []
        if modules.get(MODULE_SPREADSHEET, True):
            spreadsheet_payloads = list(blueprint.get('spreadsheets') or [])
            if spreadsheet_payloads:
                spreadsheet_ids = QuickStartProjectSeeder.seed_spreadsheets(
                    project=base.project,
                    spreadsheets=spreadsheet_payloads,
                )

        calendar_event_ids: list[str] = []
        if modules.get(MODULE_CALENDAR, True):
            event_payloads = list(blueprint.get('calendar_events') or [])
            if event_payloads and len(event_payloads) < MIN_CALENDAR_EVENTS_WHEN_ENABLED:
                raise QuickStartValidationError(
                    'At least one calendar event is required when calendar module is enabled.'
                )
            if event_payloads:
                calendar_event_ids = QuickStartProjectSeeder.seed_calendar_events(
                    project=base.project,
                    user=user,
                    calendar_id=base.calendar_id,
                    events=event_payloads,
                )

        decision_ids: list[int] = []
        if modules.get(MODULE_DECISIONS, False):
            decision_payloads = list(blueprint.get('decisions') or [])
            if decision_payloads:
                decision_ids = QuickStartProjectSeeder.seed_decisions(
                    project=base.project,
                    user=user,
                    decisions=decision_payloads,
                )

        miro_board_ids: list[str] = []
        if modules.get(MODULE_MIRO, False):
            board_payloads = list(blueprint.get('miro_boards') or [])
            if board_payloads:
                miro_board_ids = QuickStartProjectSeeder.seed_miro_boards(
                    project=base.project,
                    boards=board_payloads,
                )

        return ProjectSeedResult(
            project=base.project,
            calendar_id=base.calendar_id,
            task_ids=tuple(task_ids),
            spreadsheet_ids=tuple(spreadsheet_ids),
            calendar_event_ids=tuple(calendar_event_ids),
            decision_ids=tuple(decision_ids),
            miro_board_ids=tuple(miro_board_ids),
        )

    @staticmethod
    @transaction.atomic
    def seed_project_and_tasks(
        *,
        user: User,
        blueprint: Mapping[str, Any],
        project_title: str | None = None,
        selected_modules: Mapping[str, bool] | None = None,
    ) -> ProjectSeedResult:
        """Backward-compatible alias for seed_blueprint (qs-2.1b name retained)."""
        return QuickStartProjectSeeder.seed_blueprint(
            user=user,
            blueprint=blueprint,
            project_title=project_title,
            selected_modules=selected_modules,
        )
