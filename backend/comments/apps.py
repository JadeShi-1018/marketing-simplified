from django.apps import AppConfig


class CommentsConfig(AppConfig):
    """Application config for the reusable, entity-agnostic comments module."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "comments"
