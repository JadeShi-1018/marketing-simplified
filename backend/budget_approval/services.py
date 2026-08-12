from django.core.exceptions import ValidationError
from django.db import transaction, OperationalError
from django.db.models import Max
from .models import BudgetRequest, BudgetPool, BudgetEscalationRule, BudgetRequestStatus
from .approver_access import (
    ORG_ADMIN_OVERRIDE_PREFIX,
    is_org_admin_override_action,
    user_may_process_budget_approval,
)
from .tasks import trigger_escalation
from . import notifications as budget_notifications
from core.models import AdChannel


class BudgetRequestService:
    """Budget Request Business Logic Service"""
    
    @staticmethod
    def create_budget_request(data):
        """Create a new budget request with validation, and save it as a draft"""
        with transaction.atomic():
            # Validate required fields
            if 'budget_pool' not in data:
                raise ValidationError("budget_pool is required")
            
            if 'ad_channel' not in data:
                raise ValidationError("ad_channel is required")
            
            # Validate that objects are provided (not IDs)
            if not isinstance(data['budget_pool'], BudgetPool):
                raise ValidationError("budget_pool must be a BudgetPool instance")
            
            
            if not isinstance(data['ad_channel'], AdChannel):
                raise ValidationError("ad_channel must be an AdChannel instance")
            
            # Create budget request
            budget_request = BudgetRequest.objects.create(**data)
            
            return budget_request
    
    @staticmethod
    def check_budget_availability(budget_pool, amount):
        """Check if budget pool has sufficient available amount"""
        return budget_pool.available_amount >= amount
    
    @staticmethod
    def _write_org_admin_override_audit(budget_request, approver, is_approved, comment):
        """Persist override audit without a new migration (ApprovalRecord + notes marker)."""
        from task.models import ApprovalRecord

        user_comment = (comment or "").strip()
        audit_comment = (
            f"{ORG_ADMIN_OVERRIDE_PREFIX} {user_comment}".strip()
            if user_comment
            else ORG_ADMIN_OVERRIDE_PREFIX
        )

        task = budget_request.task
        if task is not None:
            last_step = task.approval_records.aggregate(m=Max('step_number'))['m'] or 0
            ApprovalRecord.objects.create(
                task=task,
                approved_by=approver,
                is_approved=is_approved,
                comment=audit_comment,
                step_number=last_step + 1,
                revision_round=getattr(task, 'revision_round', 0) or 0,
            )

        # Notes marker keeps override discoverable on BudgetRequest itself (and
        # covers requests with no linked task).
        decision = 'approve' if is_approved else 'reject'
        line = (
            f"{ORG_ADMIN_OVERRIDE_PREFIX} user_id={approver.id} "
            f"decision={decision}"
        )
        existing = (budget_request.notes or "").strip()
        budget_request.notes = f"{existing}\n{line}".strip() if existing else line
        budget_request.save(update_fields=['notes'])

    @staticmethod
    def _resolve_next_from_approval_chain(budget_request):
        """Next chain step after the task's current step, or None (legacy / last step).

        Org-admin override must continue the *original* ApprovalChain — the admin
        does not pick the next approver. Returns (approver_user, next_step_number).
        """
        task = getattr(budget_request, 'task', None)
        if task is None or not getattr(task, 'approval_chain_id', None):
            return None, None

        chain = task.approval_chain
        if chain is None:
            return None, None

        current_step = task.current_approval_step or 1
        next_step_num = current_step + 1
        next_step = chain.get_step(next_step_num)
        if next_step is None:
            return None, None
        return next_step.approver, next_step_num

    @staticmethod
    def _sync_task_chain_advance(budget_request, next_approver, next_step_num):
        """Keep linked Task chain pointer in sync when BudgetRequest advances."""
        task = getattr(budget_request, 'task', None)
        if task is None or next_approver is None or next_step_num is None:
            return
        task.current_approver = next_approver
        task.current_approval_step = next_step_num
        task.save(update_fields=['current_approver', 'current_approval_step'])

    @staticmethod
    def check_escalation_rules(budget_request):
        """Check if budget request should be escalated based on rules"""
        escalation_rules = BudgetEscalationRule.objects.filter(
            budget_pool=budget_request.budget_pool,
            threshold_currency=budget_request.currency,
            is_active=True
        )
        
        for rule in escalation_rules:
            if rule.should_escalate(budget_request.amount, budget_request.currency):
                return True
        
        return False
    
    @staticmethod
    def submit_budget_request(budget_request, approver):
        """Submit a budget request (DRAFT --> SUBMITTED)"""
        if not budget_request.can_submit():
            raise ValidationError("Budget request cannot be submitted in current status")
        
        with transaction.atomic():
            # Check budget availability with lock to prevent race conditions
            # Use nowait=True to avoid deadlocks, which will cause concurrent constraint failures - avoid concurrent access
            try:
                budget_pool = BudgetPool.objects.select_for_update(nowait=True).get(id=budget_request.budget_pool.id)
                if not BudgetRequestService.check_budget_availability(budget_pool, budget_request.amount):
                    raise ValidationError("Insufficient budget available in the pool")
            except BudgetPool.DoesNotExist:
                raise ValidationError("Budget pool not found")
            except OperationalError as e:
                # Handle lock acquisition failures
                if "could not obtain lock" in str(e) or "LockNotAvailable" in str(e):
                    raise ValidationError("Budget pool is currently being accessed by another request")
                raise
            
            # Assign approver
            budget_request.current_approver = approver

            # status: DRAFT --> SUBMITTED
            budget_request.submit()
            budget_request.save()

            budget_notifications.notify_budget_submitted(
                budget_request,
                actor_id=budget_request.requested_by_id,
            )

            return budget_request
    
    @staticmethod
    def start_review(budget_request):
        """Start review for a budget request (SUBMITTED --> UNDER_REVIEW)"""
        if budget_request.status != BudgetRequestStatus.SUBMITTED:
            raise ValidationError("Budget request must be in SUBMITTED status to start review")
        
        with transaction.atomic():
            # status: SUBMITTED --> UNDER_REVIEW
            budget_request.send_for_review()
            budget_request.save()
            
            # Check if escalation rules are met
            if BudgetRequestService.check_escalation_rules(budget_request):
                # If escalation rules are met
                budget_request.is_escalated = True
                budget_request.save()
                # Trigger async escalation task
                trigger_escalation.delay(budget_request.id)
            
            return budget_request
    
    @staticmethod
    def process_approval(budget_request, approver, is_approved, comment, next_approver=None):
        """Process approval or rejection of a budget request
        
        Args:
            budget_request: The BudgetRequest instance to process
            approver: The User who is making the approval decision
            is_approved: Boolean indicating approval (True) or rejection (False)
            comment: Comment from the approver
            next_approver: Optional User to forward the request to (for multi-step approval)
            
        Returns:
            BudgetRequest: A fresh instance from the database with the updated state.
                          This ensures the returned object reflects all changes made during
                          the atomic transaction, including any status transitions and field updates.
                          
        Note:
            This method returns a new object instance (not the same Python object passed in)
            to ensure consistency with the database state after the atomic transaction.
            The original object's ID remains unchanged - only the Python object reference changes.
        """
        # Backend is the only enforcement (UI buttons are not authorization).
        # Chain approver, superuser, or same-org org-admin override (MED-240).
        if not user_may_process_budget_approval(approver, budget_request):
            raise ValidationError("Only the assigned approver can process this request")
        
        if not budget_request.can_approve() and not budget_request.can_reject():
            raise ValidationError("Budget request cannot be processed in current status")

        # Capture before mutation: override = org-admin acting outside the chain
        is_override = is_org_admin_override_action(approver, budget_request)

        # MED-240: org-admin replaces the current step only. Next person comes from
        # the original ApprovalChain (not a client-supplied next_approver).
        # Legacy / no remaining steps → finalize (effective_next stays None).
        if is_override and is_approved:
            effective_next, next_step_num = (
                BudgetRequestService._resolve_next_from_approval_chain(budget_request)
            )
        else:
            effective_next = next_approver
            next_step_num = None
        
        with transaction.atomic():
            # Lock the budget request for update to ensure atomic state transition
            locked_request = BudgetRequest.objects.select_for_update().get(id=budget_request.id)
            
            # Re-check if the request can still be processed (status might have changed)
            if not locked_request.can_approve() and not locked_request.can_reject():
                raise ValidationError("Budget request cannot be processed in current status")
            
            
            # status: UNDER_REVIEW --> APPROVED
            if is_approved:
                locked_request.approve()
                locked_request.save()

                # status: APPROVED --> UNDER_REVIEW (multi-step chain)
                if effective_next:
                    locked_request.forward_to_next()
                    locked_request.current_approver = effective_next
                    locked_request.save()
                    if is_override and next_step_num is not None:
                        BudgetRequestService._sync_task_chain_advance(
                            locked_request, effective_next, next_step_num
                        )
                    budget_notifications.notify_budget_forwarded(
                        locked_request,
                        actor_id=approver.id if approver else None,
                        next_approver_id=effective_next.id,
                    )
                else:
                    budget_notifications.notify_budget_approved(
                        locked_request,
                        actor_id=approver.id if approver else None,
                        comment=comment or "",
                    )
                # Pool deduction (APPROVED → LOCKED) is intentionally deferred.
                # It happens only when the linked task is explicitly locked.

            # status: UNDER_REVIEW --> REJECTED
            else:
                locked_request.reject()
                locked_request.save()
                budget_notifications.notify_budget_rejected(
                    locked_request,
                    actor_id=approver.id if approver else None,
                    comment=comment or "",
                )

            if is_override:
                BudgetRequestService._write_org_admin_override_audit(
                    locked_request,
                    approver=approver,
                    is_approved=is_approved,
                    comment=comment,
                )

            return locked_request

    @staticmethod
    def revise_rejected_request(budget_request, revised_data):
        """Revise a rejected or cancelled budget request by modifying existing data, and save it as a draft"""
        if not budget_request.can_revise():
            raise ValidationError("Only rejected or cancelled budget requests can be revised")
    
        with transaction.atomic():
            # Update budget request data
            for field, value in revised_data.items():
                if hasattr(budget_request, field):
                    setattr(budget_request, field, value)
        
            # status: REJECTED --> DRAFT
            budget_request.revise()
            budget_request.save()
        
            return budget_request    

    @staticmethod
    def lock_budget_request(budget_request, actor_id=None):
        """Lock budget request and deduct amount from pool with concurrency control"""
        if not budget_request.can_lock():
            raise ValidationError("Budget request cannot be locked in current status")

        # Captured outside the atomic block so the notification can be sent
        # after the rolled-back transaction exits (on_commit callbacks are
        # discarded when a transaction rolls back).
        _insufficient_request = None

        try:
            with transaction.atomic():
                # Lock the budget request for update to prevent concurrent lock operations
                # Use nowait=True to prevent deadlocks and return conflict response
                try:
                    locked_request = BudgetRequest.objects.select_for_update(nowait=True).get(id=budget_request.id)

                    # Re-check if the request can still be locked (status might have changed)
                    if not locked_request.can_lock():
                        raise ValidationError("Budget request cannot be locked in current status")

                    # Lock the budget pool to prevent concurrent modifications
                    budget_pool = BudgetPool.objects.select_for_update(nowait=True).get(id=locked_request.budget_pool.id)

                    # Validate budget availability before locking (critical check)
                    if not BudgetRequestService.check_budget_availability(budget_pool, locked_request.amount):
                        # Mark for notification; do NOT call notify here — the
                        # upcoming ValidationError rolls back this atomic block
                        # which would discard any on_commit callbacks.
                        _insufficient_request = locked_request
                        raise ValidationError("Insufficient budget available for locking")

                    # status: APPROVED --> LOCKED (the only legal source state)
                    # The lock() method in the model will automatically deduct from budget pool
                    locked_request.lock()
                    locked_request.save()

                    budget_notifications.notify_budget_locked(
                        locked_request,
                        actor_id=actor_id,
                    )

                    return locked_request

                except OperationalError as e:
                    # Handle lock acquisition failures - return conflict response
                    if "could not obtain lock" in str(e) or "LockNotAvailable" in str(e):
                        raise ValidationError("Budget request or pool is currently being accessed by another request. Please try again.")
                    raise
        finally:
            # Send the pool-insufficient notification outside the rolled-back
            # transaction so its on_commit callback is not discarded.
            if _insufficient_request is not None:
                budget_notifications.notify_budget_pool_insufficient(
                    _insufficient_request,
                    actor_id=actor_id,
                )
    

    @staticmethod
    def cancel_budget_request(budget_request, actor_id=None):
        """Cancel a budget request and notify stakeholders."""
        with transaction.atomic():
            locked_request = BudgetRequest.objects.select_for_update().get(id=budget_request.id)
            locked_request.cancel()
            locked_request.save()
            budget_notifications.notify_budget_cancelled(
                locked_request,
                actor_id=actor_id,
            )
            return locked_request


class BudgetPoolService:
    """Budget Pool Business Logic Service"""
    
    @staticmethod
    def get_budget_pool_summary(budget_pool):
        """Get summary information for a budget pool"""
        # Get all budget requests for this pool
        budget_requests = budget_pool.budget_requests.all()
        
        # Calculate statistics
        total_requests = budget_requests.count()
        pending_requests = budget_requests.filter(status=BudgetRequestStatus.UNDER_REVIEW).count()
        approved_requests = budget_requests.filter(status=BudgetRequestStatus.APPROVED).count()
        rejected_requests = budget_requests.filter(status=BudgetRequestStatus.REJECTED).count()
        locked_requests = budget_requests.filter(status=BudgetRequestStatus.LOCKED).count()
        
        # Calculate total requested amount
        total_requested = sum(req.amount for req in budget_requests if req.status != BudgetRequestStatus.REJECTED)
        
        return {
            'pool_id': budget_pool.id,
            'total_amount': budget_pool.total_amount,
            'used_amount': budget_pool.used_amount,
            'available_amount': budget_pool.available_amount,
            'currency': budget_pool.currency,
            'statistics': {
                'total_requests': total_requests,
                'pending_requests': pending_requests,
                'approved_requests': approved_requests,
                'rejected_requests': rejected_requests,
                'locked_requests': locked_requests,
                'total_requested_amount': total_requested
            }
        }

