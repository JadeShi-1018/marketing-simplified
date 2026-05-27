from dataclasses import dataclass

from django.apps import apps
from django.core.exceptions import ObjectDoesNotExist, ValidationError


class InvalidCommentTargetType(ValueError):
    """Raised when an API caller references an entity type outside the registry."""

    pass


class CommentTargetNotFound(ObjectDoesNotExist):
    """Raised when a registered entity type is valid but the target row is missing."""

    pass


@dataclass(frozen=True)
class CommentTarget:
    """Resolved public entity target returned by the registry."""

    entity_type: str
    model: type
    obj: object


class CommentTargetRegistry:
    """
    Maps public API entity types to Django models.

    The API never accepts raw Django model names; all resolution flows through
    this allow-list so future entities can be added without coupling views or
    serializers to individual apps.
    """

    _registry = {
        "task": ("task", "Task"),
    }

    @classmethod
    def normalize_entity_type(cls, entity_type):
        """Normalize public entity identifiers before registry lookups."""

        return str(entity_type or "").strip().lower()

    @classmethod
    def get_model(cls, entity_type):
        """Return the Django model for a registered public entity type."""

        normalized = cls.normalize_entity_type(entity_type)
        model_ref = cls._registry.get(normalized)
        if model_ref is None:
            raise InvalidCommentTargetType(f"Unsupported comment entity_type '{entity_type}'.")
        return apps.get_model(*model_ref)

    @classmethod
    def resolve(cls, entity_type, entity_id):
        """Resolve an API entity pair into a concrete model instance."""

        normalized = cls.normalize_entity_type(entity_type)
        model = cls.get_model(normalized)
        try:
            obj = model.objects.get(pk=entity_id)
        except (model.DoesNotExist, ValidationError, ValueError, TypeError):
            raise CommentTargetNotFound(f"{normalized} target '{entity_id}' was not found.")
        return CommentTarget(entity_type=normalized, model=model, obj=obj)

    @classmethod
    def get_entity_type_for_instance(cls, instance):
        """Convert a target model instance back to its public API entity type."""

        instance_model = instance._meta.concrete_model
        for entity_type, model_ref in cls._registry.items():
            model = apps.get_model(*model_ref)
            if model._meta.concrete_model == instance_model:
                return entity_type
        raise InvalidCommentTargetType(
            f"Model '{instance._meta.label}' is not registered as a comment target."
        )
