"""
Tests for budget_approval management commands.
Covers: budget_approval/management/commands/fix_premature_budget_locks.py
"""

from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command
from io import StringIO

from task.models import Task
from budget_approval.models import BudgetRequest, BudgetRequestStatus

User = get_user_model()


@pytest.fixture
def user1(organization, db):
    import uuid
    return User.objects.create_user(
        username=f"user1_{uuid.uuid4().hex[:6]}",
        email=f"user1_{uuid.uuid4().hex[:6]}@test.com",
        password="pass123",
        organization=organization,
    )


@pytest.fixture
def user2(organization, db):
    import uuid
    return User.objects.create_user(
        username=f"user2_{uuid.uuid4().hex[:6]}",
        email=f"user2_{uuid.uuid4().hex[:6]}@test.com",
        password="pass123",
        organization=organization,
    )


@pytest.fixture
def approved_task(project, user1, db):
    """A task with APPROVED status – required for the 'premature lock' scenario."""
    return Task.objects.create(
        summary="Test Task",
        type="budget",
        project=project,
        owner=user1,
        status=Task.Status.APPROVED,
    )


@pytest.fixture
def locked_budget_request_with_approved_task(approved_task, user1, user2, ad_channel, budget_pool, db):
    """
    A BudgetRequest that is LOCKED but whose task is still APPROVED.
    This is the 'premature lock' scenario the command is designed to fix.
    """
    pool = budget_pool
    pool.used_amount = Decimal("500.00")
    pool.save()

    br = BudgetRequest.objects.create(
        task=approved_task,
        requested_by=user1,
        current_approver=user2,
        amount=Decimal("500.00"),
        currency="USD",
        budget_pool=pool,
        ad_channel=ad_channel,
        notes="Premature lock test",
    )
    # Force set to LOCKED status bypassing FSM
    BudgetRequest.objects.filter(pk=br.pk).update(status=BudgetRequestStatus.LOCKED)
    # Cannot call refresh_from_db() because FSMField(protected=True) blocks setattr.
    # Update the in-memory object directly via __dict__ to bypass the descriptor.
    br.__dict__['status'] = BudgetRequestStatus.LOCKED
    return br


@pytest.mark.django_db
class TestFixPrematureBudgetLocksCommand:
    """Tests for the fix_premature_budget_locks management command."""

    def test_no_bad_records_found(self, budget_pool):
        """Command exits early with success message when no premature locks exist."""
        out = StringIO()
        call_command("fix_premature_budget_locks", stdout=out)
        output = out.getvalue()
        assert "No premature locks found" in output

    def test_dry_run_does_not_modify_records(
        self, locked_budget_request_with_approved_task, budget_pool
    ):
        """--dry-run flag prints what would change without making DB changes."""
        br = locked_budget_request_with_approved_task
        original_used = budget_pool.used_amount  # Decimal("500.00")

        out = StringIO()
        call_command("fix_premature_budget_locks", dry_run=True, stdout=out)
        output = out.getvalue()

        assert "Dry run" in output
        # BR should still be LOCKED – use values_list to bypass FSMField protected setter
        status_in_db = BudgetRequest.objects.filter(pk=br.pk).values_list('status', flat=True).first()
        assert status_in_db == BudgetRequestStatus.LOCKED
        # Pool should be unchanged
        budget_pool.refresh_from_db()
        assert budget_pool.used_amount == original_used

    def test_actual_run_resets_status_and_reverses_pool(
        self, locked_budget_request_with_approved_task, budget_pool
    ):
        """Without --dry-run, the command resets BR to APPROVED and reverses pool deduction."""
        br = locked_budget_request_with_approved_task
        assert br.status == BudgetRequestStatus.LOCKED
        assert budget_pool.used_amount == Decimal("500.00")

        out = StringIO()
        call_command("fix_premature_budget_locks", stdout=out)
        output = out.getvalue()

        assert "Fixed 1" in output

        # Use values_list to bypass FSMField protected setter on refresh_from_db
        status_in_db = BudgetRequest.objects.filter(pk=br.pk).values_list('status', flat=True).first()
        assert status_in_db == BudgetRequestStatus.APPROVED

        budget_pool.refresh_from_db()
        assert budget_pool.used_amount == Decimal("0.00")

    def test_dry_run_prints_br_details(
        self, locked_budget_request_with_approved_task, budget_pool
    ):
        """Dry run output includes BR id, task id, and amount."""
        br = locked_budget_request_with_approved_task
        out = StringIO()
        call_command("fix_premature_budget_locks", dry_run=True, stdout=out)
        output = out.getvalue()
        assert f"id={br.id}" in output
        assert "500" in output

    def test_pool_does_not_go_below_zero(self, approved_task, user1, user2, ad_channel, budget_pool, db):
        """Pool used_amount should not go negative even if deduction would underflow."""
        pool = budget_pool
        pool.used_amount = Decimal("100.00")
        pool.save()

        br = BudgetRequest.objects.create(
            task=approved_task,
            requested_by=user1,
            current_approver=user2,
            amount=Decimal("500.00"),  # More than pool.used_amount
            currency="USD",
            budget_pool=pool,
            ad_channel=ad_channel,
        )
        BudgetRequest.objects.filter(pk=br.pk).update(status=BudgetRequestStatus.LOCKED)

        out = StringIO()
        call_command("fix_premature_budget_locks", stdout=out)

        pool.refresh_from_db()
        # max(0, 100 - 500) = 0
        assert pool.used_amount == Decimal("0.00")
