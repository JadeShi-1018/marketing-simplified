from django.contrib import admin

from .models import Notification, UserNotificationPreference


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("title", "recipient", "category", "event_type", "is_read", "created_at")
    list_filter = ("category", "event_type", "is_read")
    search_fields = ("title", "recipient__username")


@admin.register(UserNotificationPreference)
class UserNotificationPreferenceAdmin(admin.ModelAdmin):
    list_display = ("user", "updated_at")
