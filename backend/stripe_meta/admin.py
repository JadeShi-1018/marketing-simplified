from django.contrib import admin

from .models import LLMCallLog, OrgMonthlyCost


@admin.register(OrgMonthlyCost)
class OrgMonthlyCostAdmin(admin.ModelAdmin):
    list_display = ('organization', 'year_month', 'llm_cost_display', 'total_tokens')
    list_filter = ('year_month',)
    search_fields = ('organization__name',)
    ordering = ('-year_month', '-llm_cost_cents')
    readonly_fields = ('organization', 'year_month', 'llm_cost_cents', 'total_tokens')

    def llm_cost_display(self, obj):
        return f'${obj.llm_cost_cents / 100:.2f}'
    llm_cost_display.short_description = 'LLM Cost (USD)'
    llm_cost_display.admin_order_field = 'llm_cost_cents'


@admin.register(LLMCallLog)
class LLMCallLogAdmin(admin.ModelAdmin):
    list_display = (
        'organization', 'provider', 'model_name',
        'normalized_tokens', 'total_cost_cents', 'success', 'created_at',
    )
    list_filter = ('success', 'provider')
    search_fields = ('organization__name',)
    ordering = ('-created_at',)
    date_hierarchy = 'created_at'
    readonly_fields = (
        'organization', 'user', 'agent_session', 'provider', 'model_name',
        'input_tokens', 'output_tokens', 'normalized_tokens',
        'input_cost_cents', 'output_cost_cents', 'total_cost_cents',
        'success', 'error_message', 'created_at',
    )
