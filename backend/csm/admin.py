from django.contrib import admin
from .models import Queue, QueueAgent, QueueTeam, CSMInvitation


@admin.register(Queue)
class QueueAdmin(admin.ModelAdmin):
    list_display = ['name', 'project', 'tier', 'display_order', 'is_active', 'created_at']
    list_filter = ['tier', 'is_active']
    search_fields = ['name']


@admin.register(QueueAgent)
class QueueAgentAdmin(admin.ModelAdmin):
    list_display = ['queue', 'user', 'assigned_by', 'created_at']


@admin.register(QueueTeam)
class QueueTeamAdmin(admin.ModelAdmin):
    list_display = ['queue', 'team', 'created_at']


@admin.register(CSMInvitation)
class CSMInvitationAdmin(admin.ModelAdmin):
    list_display = ['email', 'project', 'team', 'accepted', 'expires_at', 'created_at']
    list_filter = ['accepted']
    search_fields = ['email']
