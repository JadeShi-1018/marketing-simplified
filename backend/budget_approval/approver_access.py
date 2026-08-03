"""Who may approve/reject a budget request (chain approver vs org-admin override).

Shared by DRF permissions and BudgetRequestService so both gates use one rule.
"""

from __future__ import annotations

from core.admin_utils import is_org_admin


def budget_request_organization(budget_request):
    """Resolve the org that owns this request (via budget_pool → project)."""
    if budget_request is None:
        return None
    try:
        return budget_request.budget_pool.project.organization
    except Exception:
        return None


def user_is_org_admin_for_budget_request(user, budget_request) -> bool:
    """True when user is org-admin of the same org as the budget request."""
    if user is None or budget_request is None:
        return False
    if not is_org_admin(user):
        return False

    request_org = budget_request_organization(budget_request)
    if request_org is None:
        return False

    user_org = getattr(user, 'current_organization', None) or getattr(user, 'organization', None)
    if user_org is None:
        return False

    return user_org.id == request_org.id


def user_may_process_budget_approval(user, budget_request) -> bool:
    """Superuser, current chain approver, or same-org org-admin (MED-240)."""
    if user is None or budget_request is None:
        return False

    if getattr(user, 'is_superuser', False):
        return True

    if budget_request.current_approver_id is not None and budget_request.current_approver_id == getattr(user, 'id', None):
        return True

    return user_is_org_admin_for_budget_request(user, budget_request)
