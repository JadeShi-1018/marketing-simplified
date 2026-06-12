from django.db import transaction
from django.db.models import QuerySet

from core.models import ProjectMember
from core.slug_mixins import resolve_lookup_kwargs
from miro.models import Board, BoardAccess


def user_has_project_access(user, project_id) -> bool:
    return ProjectMember.objects.filter(
        user=user,
        **resolve_lookup_kwargs(project_id, 'project_id', 'project__slug'),
        is_active=True,
    ).exists()


def get_accessible_board_for_user(user, board_id) -> Board:
    from core.slug_mixins import resolve_lookup_kwargs
    return Board.objects.select_related("project").get(
        **resolve_lookup_kwargs(board_id, 'id'),
        project__members__user=user,
        project__members__is_active=True,
    )


def get_project_boards_queryset(project_id) -> QuerySet[Board]:
    return Board.objects.filter(
        **resolve_lookup_kwargs(project_id, 'project_id', 'project__slug'),
        is_archived=False,
    ).order_by("-updated_at", "-created_at")


def get_latest_project_board_for_user(user, project_id) -> Board | None:
    access = (
        BoardAccess.objects.select_related("board")
        .filter(user=user, **resolve_lookup_kwargs(project_id, 'project_id', 'project__slug'), board__is_archived=False)
        .first()
    )
    if access:
        return access.board
    return get_project_boards_queryset(project_id).first()


@transaction.atomic
def record_board_access(user, board: Board) -> BoardAccess:
    board_access, _ = BoardAccess.objects.update_or_create(
        user=user,
        project=board.project,
        defaults={"board": board},
    )
    return board_access
