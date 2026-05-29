"""qs-2.1c: Quick Start spreadsheet seeder tests."""

import pytest

from core.services.quick_start.seeder import QuickStartProjectSeeder
from core.services.quick_start.validation import validate_and_normalize_blueprint
from core.tests.test_quick_start_llm import DEFAULT_MODULES, SAMPLE_LLM_PAYLOAD
from spreadsheet.models import Cell, CellValueType, Sheet, SheetColumn, Spreadsheet


@pytest.mark.django_db
class TestQuickStartSpreadsheetSeeder:
    def test_seed_spreadsheets_creates_sheet_columns_and_cells(self, user):
        blueprint = validate_and_normalize_blueprint(SAMPLE_LLM_PAYLOAD, DEFAULT_MODULES)
        base = QuickStartProjectSeeder.seed_project(user=user, blueprint=blueprint)

        spreadsheet_ids = QuickStartProjectSeeder.seed_spreadsheets(
            project=base.project,
            spreadsheets=blueprint['spreadsheets'],
        )

        assert len(spreadsheet_ids) == 1
        spreadsheet = Spreadsheet.objects.get(id=spreadsheet_ids[0])
        assert spreadsheet.name == 'Campaign Budget'
        assert spreadsheet.project_id == base.project.id

        sheet = Sheet.objects.filter(spreadsheet=spreadsheet, is_deleted=False).first()
        assert sheet is not None
        assert sheet.name == 'Budget'

        columns = SheetColumn.objects.filter(sheet=sheet, is_deleted=False).order_by('position')
        assert columns.count() >= 3
        assert list(columns.values_list('name', flat=True)[:3]) == ['Channel', 'Budget', 'Notes']

        populated_cells = Cell.objects.filter(sheet=sheet, is_deleted=False).exclude(
            value_type=CellValueType.EMPTY
        )
        assert populated_cells.count() >= 6

    def test_seed_project_and_tasks_includes_spreadsheets(self, user):
        blueprint = validate_and_normalize_blueprint(SAMPLE_LLM_PAYLOAD, DEFAULT_MODULES)

        result = QuickStartProjectSeeder.seed_project_and_tasks(
            user=user,
            blueprint=blueprint,
            selected_modules=DEFAULT_MODULES,
        )

        assert len(result.spreadsheet_ids) == 1
        assert Spreadsheet.objects.filter(project=result.project).count() == 1
