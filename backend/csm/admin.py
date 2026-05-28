from django.contrib import admin
from .models import Queue, QueueAgent, QueueTeam, CustomerUser, Ticket, CSMInvitation


@admin.register(Queue)
class QueueAdmin(admin.ModelAdmin):
    list_display = ['name', 'project', 'organisation', 'tier', 'display_order', 'is_active', 'created_at']
    list_filter = ['tier', 'is_active']
    search_fields = ['name']


@admin.register(QueueAgent)
class QueueAgentAdmin(admin.ModelAdmin):
    list_display = ['queue', 'user', 'assigned_by', 'created_at']


@admin.register(QueueTeam)
class QueueTeamAdmin(admin.ModelAdmin):
    list_display = ['queue', 'team', 'created_at']


@admin.register(CustomerUser)
class CustomerUserAdmin(admin.ModelAdmin):
    list_display = ['user', 'team', 'queue', 'user_type', 'is_active', 'created_at']
    list_filter = ['user_type', 'is_active']
    search_fields = ['user__email']


@admin.register(Ticket)
class TicketAdmin(admin.ModelAdmin):
    list_display = ['title', 'queue', 'status', 'priority', 'assigned_to', 'created_at']
    list_filter = ['status', 'priority']
    search_fields = ['title', 'customer_email']


@admin.register(CSMInvitation)
class CSMInvitationAdmin(admin.ModelAdmin):
    list_display = ['email', 'project', 'team', 'accepted', 'expires_at', 'created_at']
    list_filter = ['accepted']
    search_fields = ['email']
