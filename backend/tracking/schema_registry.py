import logging

from pydantic import BaseModel

logger = logging.getLogger(__name__)


class SchemaRegistry:
    def __init__(self):
        self._registry: dict[str, type[BaseModel]] = {}

    def register(self, event_type: str, schema_cls: type[BaseModel]) -> None:
        self._registry[event_type] = schema_cls

    def validate(self, event_type: str, payload: dict) -> dict:
        schema_cls = self._registry.get(event_type)
        if schema_cls is None:
            logger.warning(
                "SchemaRegistry: no schema registered for event_type=%r; passing through",
                event_type,
            )
            return payload
        # Raises pydantic.ValidationError on invalid payload — callers must handle.
        return schema_cls.model_validate(payload).model_dump()


registry = SchemaRegistry()
