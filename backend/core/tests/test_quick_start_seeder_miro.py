"""qs-2.1f: Quick Start Miro board seeder tests."""

import pytest

from core.services.quick_start.seeder import QuickStartProjectSeeder
from core.services.quick_start.validation import validate_and_normalize_blueprint
from core.tests.test_quick_start_llm import DEFAULT_MODULES, SAMPLE_LLM_PAYLOAD
from miro.models import Board, BoardItem


def _sample_miro_board():
    return {
        'name': 'Campaign planning',
        'sticky_notes': [
            {'content': 'Launch goals & KPIs', 'x': 80, 'y': 80},
            {'content': 'Channel mix: Meta + Google', 'x': 320, 'y': 80},
        ],
    }


@pytest.mark.django_db
class TestQuickStartMiroSeeder:
    def test_seed_miro_boards_creates_board_with_sticky_notes(self, user):
        payload = {
            **SAMPLE_LLM_PAYLOAD,
            'miro_boards': [_sample_miro_board()],
        }
        modules = {**DEFAULT_MODULES, 'miro': True}
        blueprint = validate_and_normalize_blueprint(payload, modules)

        result = QuickStartProjectSeeder.seed_blueprint(
            user=user,
            blueprint=blueprint,
            selected_modules=modules,
        )

        assert len(result.miro_board_ids) == 1
        board = Board.objects.get(id=result.miro_board_ids[0])
        assert board.title == 'Campaign planning'
        assert len(board.share_token) == 24
        assert board.project_id == result.project.id
        items = BoardItem.objects.filter(board=board, is_deleted=False)
        assert items.count() == 2
        assert items.filter(type=BoardItem.ItemType.STICKY_NOTE).count() == 2
        assert items.filter(content__icontains='Launch goals').exists()

    def test_miro_disabled_skips_seed(self, user):
        blueprint = validate_and_normalize_blueprint(SAMPLE_LLM_PAYLOAD, DEFAULT_MODULES)
        result = QuickStartProjectSeeder.seed_blueprint(
            user=user,
            blueprint=blueprint,
            selected_modules=DEFAULT_MODULES,
        )
        assert result.miro_board_ids == ()
