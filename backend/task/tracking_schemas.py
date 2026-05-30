from pydantic import BaseModel

from tracking.enums import EventType
from tracking.schema_registry import registry


class TaskOpenMeta(BaseModel):
    user_agent: str | None = None
    referer: str | None = None
    view_name: str | None = None
    project_id: int | None = None
    internal_refetch: bool = False


class FirstInteractionMeta(BaseModel):
    user_agent: str | None = None
    referer: str | None = None
    view_name: str | None = None
    project_id: int | None = None
    internal_refetch: bool = False


class TaskWriteMeta(BaseModel):
    user_agent: str | None = None
    referer: str | None = None
    view_name: str | None = None
    project_id: int | None = None
    internal_refetch: bool = False


registry.register(EventType.TASK_OPEN, TaskOpenMeta)
registry.register(EventType.FIRST_INTERACTION, FirstInteractionMeta)
registry.register(EventType.TASK_WRITE, TaskWriteMeta)
