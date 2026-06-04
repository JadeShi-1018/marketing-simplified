from django.apps import AppConfig


class ChatConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'chat'
    verbose_name = 'Chat'

    def ready(self):
        import chat.signals  # noqa: F401 — registers post_save signal
