# admin.py
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.contrib.auth import get_user_model
from .models import AuthenticationLockout

User = get_user_model()

class CustomUserAdmin(UserAdmin):
    model = User
    list_display = ('email', 'username', 'is_verified', 'organization', 'is_staff')
    fieldsets = UserAdmin.fieldsets + (
        (None, {'fields': ('is_verified', 'organization')}),
    )

admin.site.register(User, CustomUserAdmin)


@admin.register(AuthenticationLockout)
class AuthenticationLockoutAdmin(admin.ModelAdmin):
    list_display = (
        'scope',
        'identifier',
        'reason',
        'failure_count',
        'locked_until',
        'resolved_at',
        'is_active',
        'seconds_remaining',
        'created_at',
    )
    list_filter = ('scope', 'reason', 'resolved_at', 'created_at', 'locked_until')
    search_fields = ('identifier', 'reason')
    readonly_fields = (
        'id',
        'is_active',
        'seconds_remaining',
        'created_at',
        'updated_at',
    )
    ordering = ('-created_at',)
