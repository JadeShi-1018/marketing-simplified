import logging
import traceback
import stripe
from datetime import datetime
from django.conf import settings
from django.utils import timezone
from django.http import JsonResponse, HttpResponseRedirect, HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .permissions import HasValidOrganizationToken, IsOrganizationAdmin
from .models import Plan, Subscription, UsageDaily, Payment, StripeWebhookEvent
from .serializers import (
    PlanSerializer, SubscriptionSerializer, UsageDailySerializer, CheckoutSessionSerializer, 
    OrganizationSerializer, CreateOrganizationSerializer, OrganizationUserSerializer
)
from rest_framework.pagination import PageNumberPagination
from django.db import transaction
from core.models import Organization, CustomUser

# Configure Stripe
stripe.api_key = settings.STRIPE_SECRET_KEY
logger = logging.getLogger(__name__)

@api_view(['GET'])
@permission_classes([IsAuthenticated, HasValidOrganizationToken])
def list_plans(request):
    """List non-archived subscription plans. Zero Stripe API calls."""
    try:
        plans = Plan.objects.filter(is_archived=False).order_by('base_price_cents')
        serializer = PlanSerializer(plans, many=True)
        return Response({
            'count': plans.count(),
            'results': serializer.data,
        })
    except Exception as e:
        return Response(
            {'error': str(e), 'code': 'PLANS_RETRIEVAL_ERROR'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@api_view(['POST'])
@permission_classes([IsAuthenticated, HasValidOrganizationToken, IsOrganizationAdmin])
def switch_plan(request):
    """Switch user's subscription to a different plan"""
    try:
        plan_id = request.data.get('plan_id')
        if not plan_id:
            return Response(
                {'error': 'plan_id is required', 'code': 'MISSING_PLAN_ID'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        user = request.user
        
        try:
            new_plan = Plan.objects.get(id=plan_id)
        except Plan.DoesNotExist:
            return Response(
                {'error': 'Plan not found', 'code': 'PLAN_NOT_FOUND'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Get current subscription
        current_subscription = Subscription.objects.filter(
            organization=user.organization,
            is_active=True
        ).first()
        
        if not current_subscription:
            return Response(
                {'error': 'No active subscription found', 'code': 'NO_SUBSCRIPTION'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check if already on the same plan
        if current_subscription.plan.id == new_plan.id:
            return Response(
                {'error': 'Already subscribed to this plan', 'code': 'SAME_PLAN'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get current subscription item ID and price from Stripe
        stripe_subscription = stripe.Subscription.retrieve(current_subscription.stripe_subscription_id)
        current_item_id = stripe_subscription['items']['data'][0]['id']
        
        # Get prices to determine if upgrade or downgrade
        current_price_data = stripe.Price.retrieve(current_subscription.plan.stripe_price_id)
        new_price_data = stripe.Price.retrieve(new_plan.stripe_price_id)
        current_price = current_price_data.unit_amount / 100  # Convert cents to dollars
        new_price = new_price_data.unit_amount / 100
        
        is_upgrade = new_price > current_price
        
        # Update subscription in Stripe based on upgrade/downgrade
        if is_upgrade:
            # UPGRADE: Immediate switch with proration
            stripe.Subscription.modify(
                current_subscription.stripe_subscription_id,
                items=[{
                    'id': current_item_id,
                    'price': new_plan.stripe_price_id,
                }],
                proration_behavior='always_invoice'  # Charge prorated amount immediately
            )
            # DON'T update local subscription - webhook will handle it
            # The subscription.updated webhook will update the plan when upgrade completes
            
            return Response({
                'requested': True
            })
        else:
            # DOWNGRADE: Immediate switch with no refund
            stripe.Subscription.modify(
                current_subscription.stripe_subscription_id,
                items=[{
                    'id': current_item_id,
                    'price': new_plan.stripe_price_id,
                }],
                proration_behavior='none'  # No refund or proration
            )
            # DON'T update local subscription - webhook will handle it
            # The subscription.updated webhook will update the plan when downgrade completes
            
            return Response({
                'requested': True
            })
        
    except stripe.StripeError as e:
        return Response(
            {'error': str(e), 'code': 'STRIPE_ERROR'},
            status=status.HTTP_400_BAD_REQUEST
        )
    except Exception as e:
        return Response(
            {'error': str(e), 'code': 'PLAN_SWITCH_ERROR'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated, HasValidOrganizationToken])
def get_subscription(request):
    """Get current user's subscription"""
    try:
        user = request.user
        subscription = Subscription.objects.filter(
            organization=user.organization,
            is_active=True
        ).first()
        
        if not subscription:
            return Response(
                {'error': 'No active subscription found', 'code': 'NO_SUBSCRIPTION'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        serializer = SubscriptionSerializer(subscription)
        return Response(serializer.data)
    except Exception as e:
        return Response(
            {'error': str(e), 'code': 'SUBSCRIPTION_RETRIEVAL_ERROR'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@api_view(['POST'])
@permission_classes([IsAuthenticated, HasValidOrganizationToken, IsOrganizationAdmin])
def cancel_subscription(request):
    """Cancel user's active subscription"""
    try:
        user = request.user
        subscription = Subscription.objects.filter(
            organization=user.organization,
            is_active=True
        ).first()
        
        if not subscription:
            return Response(
                {'error': 'No active subscription found', 'code': 'NO_SUBSCRIPTION'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Cancel subscription in Stripe
        stripe.Subscription.cancel(subscription.stripe_subscription_id)
        
        return Response({'success': True})
        
    except stripe.StripeError as e:
        return Response(
            {'error': str(e), 'code': 'STRIPE_ERROR'},
            status=status.HTTP_400_BAD_REQUEST
        )
    except Exception as e:
        return Response(
            {'error': str(e), 'code': 'CANCEL_ERROR'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_organization(request):
    """Create a new organization"""
    try:
        if request.user.organization:
            return Response(
                {'error': 'User is already in an organization', 'code': 'USER_ALREADY_IN_ORGANIZATION'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Validate input data using serializer
        serializer = CreateOrganizationSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        validated_data = serializer.validated_data
        
        organization = Organization.objects.create(
            name=validated_data['name'],
            desc=validated_data.get('description', ''),
            email_domain=validated_data.get('email_domain', '')
        )
        
        # Assign user to organization
        user = request.user
        user.organization = organization
        user.save()
        
        serializer = OrganizationSerializer(organization)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
        
    except Exception as e:
        return Response(
            {'error': str(e), 'code': 'ORGANIZATION_CREATION_ERROR'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@api_view(['POST'])
@permission_classes([IsAuthenticated, HasValidOrganizationToken, IsOrganizationAdmin])
def invite_users_to_organization(request):
    """Invite users to organization by email"""
    try:
        user = request.user
        
        if not user.organization:
            return Response(
                {'error': 'User is not in any organization', 'code': 'NO_ORGANIZATION'},
                status=status.HTTP_400_BAD_REQUEST
            )
        emails = request.data.get('emails')
        if not emails or not isinstance(emails, list) or len(emails) == 0:
            return Response(
                {'error': 'No emails provided', 'code': 'NO_EMAILS_PROVIDED'},
                status=status.HTTP_400_BAD_REQUEST
            )
        organization = user.organization
        
        with transaction.atomic():
            try:
                for email in emails:
                    user = CustomUser.objects.filter(email=email).first()
                    if not user:
                        raise Exception(f'User {email} not found')
                    elif user.organization:
                        raise Exception(f'User {email} is already a member of an organization')
                    else:
                        user.organization = organization
                        user.save()
            except Exception as e:
                return Response(
                    {'error': str(e), 'code': 'INVITE_USERS_ERROR'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
        
        return Response({
            'success': True
        })
    
    except Exception as e:
        return Response(
            {'error': str(e), 'code': 'INVITE_USERS_ERROR'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@api_view(['POST'])
@permission_classes([IsAuthenticated, HasValidOrganizationToken])
def leave_organization(request):
    """Remove current user from their organization"""
    try:
        user = request.user
        # Remove user from organization
        user.organization = None
        user.save()
        
        return Response({
            'success': True
        })
        
    except Exception as e:
        return Response(
            {'error': str(e), 'code': 'LEAVE_ORGANIZATION_ERROR'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@api_view(['POST'])
@permission_classes([IsAuthenticated, HasValidOrganizationToken])
def create_checkout_session(request):
    """Create Stripe checkout session for token-based subscription."""
    try:
        serializer = CheckoutSessionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        plan_id = serializer.validated_data['plan_id']
        success_url = serializer.validated_data['success_url']
        cancel_url = serializer.validated_data['cancel_url']
        seat_count = serializer.validated_data.get('seat_count', 1)

        plan = Plan.objects.get(id=plan_id)
        user = request.user
        org = user.organization

        # Free sentinel subscriptions are is_internal=True — do not treat them as
        # "already subscribed". Only block on a real paid active subscription.
        existing = Subscription.objects.filter(
            organization=org,
            is_active=True,
            is_internal=False,
        ).first()
        if existing:
            return Response(
                {
                    'error': 'Organization already has an active subscription. Use switch plan to change your plan.',
                    'code': 'SUBSCRIPTION_EXISTS',
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Customer caching — select_for_update prevents duplicate Customer.create
        # calls under concurrent checkout clicks (concurrency bug fix).
        with transaction.atomic():
            org_locked = Organization.objects.select_for_update().get(pk=org.pk)
            if org_locked.stripe_customer_id:
                customer_id = org_locked.stripe_customer_id
            else:
                customer = stripe.Customer.create(
                    name=org_locked.name,
                    email=user.email,
                    metadata={
                        'user_id': str(user.id),
                        'organization_id': str(org_locked.id),
                    },
                )
                org_locked.stripe_customer_id = customer.id
                org_locked.save(update_fields=['stripe_customer_id'])
                customer_id = customer.id

        # Three-tier line items: base + extra seats + metered overage
        line_items = [{'price': plan.stripe_price_id, 'quantity': 1}]
        extra_seats = seat_count - (plan.included_seats or 1)
        if extra_seats > 0 and plan.stripe_extra_seat_price_id:
            line_items.append({
                'price': plan.stripe_extra_seat_price_id,
                'quantity': extra_seats,
            })
        if plan.stripe_overage_price_id:
            line_items.append({'price': plan.stripe_overage_price_id})

        session = stripe.checkout.Session.create(
            customer=customer_id,
            payment_method_types=['card'],
            line_items=line_items,
            mode='subscription',
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={
                'user_id': str(user.id),
                'organization_id': str(org.id),
                'seat_count': str(seat_count),
            },
        )

        return Response({'checkout_url': session.url}, status=status.HTTP_200_OK)

    except Plan.DoesNotExist:
        return Response(
            {'error': 'Plan not found', 'code': 'PLAN_NOT_FOUND'},
            status=status.HTTP_404_NOT_FOUND,
        )
    except stripe.StripeError as e:
        return Response(
            {'error': str(e), 'code': 'STRIPE_ERROR'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    except Exception as e:
        logger.exception("create_checkout_session unexpected error")
        return Response(
            {'error': str(e), 'code': 'CHECKOUT_SESSION_ERROR'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated, HasValidOrganizationToken])
def get_usage(request):
    """Get current user's usage statistics"""
    try:
        user = request.user
        
        # Check if organization has an active subscription
        has_active_subscription = Subscription.objects.filter(
            organization=user.organization,
            is_active=True
        ).exists()
        
        if not has_active_subscription:
            return Response({
                'error': 'No active subscription',
                'code': 'NO_ACTIVE_SUBSCRIPTION'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        usage = UsageDaily.objects.filter(user=user).first()
        
        if not usage:
            return Response({
                'error': 'No usage found',
                'code': 'NO_USAGE_FOUND'
            }, status=status.HTTP_404_NOT_FOUND)
        
        serializer = UsageDailySerializer(usage)
        return Response(serializer.data)
        
    except Exception as e:
        return Response(
            {'error': str(e), 'code': 'USAGE_RETRIEVAL_ERROR'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@csrf_exempt
@require_http_methods(["POST"])
def stripe_webhook(request):
    """Handle Stripe webhook events with idempotency and error bubbling."""
    payload = request.body
    sig_header = request.META.get('HTTP_STRIPE_SIGNATURE')

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
        )
    except ValueError:
        return JsonResponse({'error': 'Invalid payload'}, status=400)
    except stripe.SignatureVerificationError:
        return JsonResponse({'error': 'Invalid signature'}, status=400)
    except Exception:
        logger.exception("stripe_webhook construct_event failed")
        return JsonResponse({'error': 'Webhook processing error', 'code': 'WEBHOOK_ERROR'}, status=500)

    event_id = event['id']
    event_type = event['type']

    webhook_event, created = StripeWebhookEvent.objects.get_or_create(
        stripe_event_id=event_id,
        defaults={'event_type': event_type},
    )
    if not created and webhook_event.processed_at is not None:
        logger.info("stripe_webhook duplicate event_id=%s event_type=%s", event_id, event_type)
        return JsonResponse({'received': True, 'status': 'duplicate'})

    handlers = {
        'checkout.session.completed': handle_checkout_completed,
        'customer.subscription.created': handle_subscription_created,
        'customer.subscription.updated': handle_subscription_updated,
        'customer.subscription.deleted': handle_subscription_deleted,
        'invoice.payment_succeeded': handle_payment_succeeded,
        'invoice.payment_failed': handle_payment_failed,
    }

    handler = handlers.get(event_type)
    if handler is None:
        webhook_event.processed_at = timezone.now()
        webhook_event.save(update_fields=['processed_at'])
        logger.info("stripe_webhook ignored event_id=%s event_type=%s", event_id, event_type)
        return JsonResponse({'received': True, 'status': 'ignored'})

    try:
        handler(event['data']['object'], event_id=event_id)
        webhook_event.processed_at = timezone.now()
        webhook_event.save(update_fields=['processed_at'])
        return JsonResponse({'received': True})
    except Exception:
        webhook_event.error_message = traceback.format_exc()[:2000]
        webhook_event.save(update_fields=['error_message'])
        logger.exception("stripe_webhook handler failed event_id=%s event_type=%s", event_id, event_type)
        return JsonResponse({'error': 'Handler failed'}, status=500)


class StandardResultsSetPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 100


@api_view(['GET'])
@permission_classes([IsAuthenticated, HasValidOrganizationToken])
def list_organization_users(request):
    """List users in the authenticated user's organization with pagination"""
    try:
        if not request.user.organization:
            return Response(
                {'error': 'No organization found for user', 'code': 'NO_ORGANIZATION'},
                status=status.HTTP_400_BAD_REQUEST
            )

        qs = CustomUser.objects.filter(organization=request.user.organization).order_by('id')
        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(qs, request)
        serializer = OrganizationUserSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)
    except Exception as e:
        return Response(
            {'error': str(e), 'code': 'ORG_USERS_LIST_ERROR'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['DELETE'])
@permission_classes([IsAuthenticated, HasValidOrganizationToken, IsOrganizationAdmin])
def remove_organization_user(request, user_id: int):
    """Remove a user from the authenticated user's organization by user_id"""
    try:
        if not request.user.organization:
            return Response(
                {'error': 'No organization found for user', 'code': 'NO_ORGANIZATION'},
                status=status.HTTP_400_BAD_REQUEST
            )

        target = CustomUser.objects.filter(id=user_id, organization=request.user.organization).first()
        if not target:
            return Response(
                {'error': 'User not found in organization', 'code': 'USER_NOT_IN_ORG'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Allow anyone in org to remove any user for now (no roles yet)
        target.organization = None
        target.save()

        return Response({'success': True})
    except Exception as e:
        return Response(
            {'error': str(e), 'code': 'ORG_USER_REMOVE_ERROR'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

def handle_checkout_completed(session, event_id=None):
    """Handle successful checkout session completion."""
    org_id = (session.get('metadata') or {}).get('organization_id')
    logger.info("handle_checkout_completed enter event_id=%s org_id=%s", event_id, org_id)
    # No-op: subscription/invoice webhooks are the source of truth for DB updates.
    logger.info("handle_checkout_completed exit event_id=%s org_id=%s", event_id, org_id)


def handle_subscription_created(subscription_data, event_id=None):
    """Handle new subscription creation."""
    subscription_id = subscription_data.get('id')
    customer_id = subscription_data.get('customer')
    org_id = None
    if customer_id:
        customer = stripe.Customer.retrieve(customer_id)
        org_id = customer.metadata.get('organization_id')

    logger.info(
        "handle_subscription_created enter event_id=%s subscription_id=%s org_id=%s",
        event_id, subscription_id, org_id,
    )

    if not org_id:
        raise ValueError("Organization ID not found in subscription or customer metadata")

    organization = Organization.objects.filter(id=org_id).first()
    if not organization:
        raise ValueError(f"Organization {org_id} not found")

    items = subscription_data.get('items', {}).get('data', [])
    price_id = items[0]['price']['id'] if items else None
    plan = Plan.objects.filter(stripe_price_id=price_id).first() if price_id else None

    start_date = subscription_data.get('start_date')
    end_date = items[0].get('current_period_end') if items else None

    subscription, created = Subscription.objects.update_or_create(
        stripe_subscription_id=subscription_id,
        defaults={
            'organization': organization,
            'plan': plan,
            'start_date': datetime.fromtimestamp(start_date) if start_date else None,
            'end_date': datetime.fromtimestamp(end_date) if end_date else None,
            'is_active': subscription_data.get('status') == 'active',
        },
    )

    logger.info(
        "handle_subscription_created exit event_id=%s org_id=%s created=%s",
        event_id, org_id, created,
    )


def handle_payment_succeeded(invoice_data, event_id=None):
    """Handle successful payment."""
    customer_id = invoice_data.get('customer')
    logger.info("handle_payment_succeeded enter event_id=%s customer_id=%s", event_id, customer_id)

    parent = invoice_data.get('parent', {})
    subscription_details = parent.get('subscription_details', {})
    stripe_subscription_id = subscription_details.get('subscription')

    customer = stripe.Customer.retrieve(customer_id) if customer_id else None
    user_id = customer.metadata.get('user_id') if customer else None
    org_id = customer.metadata.get('organization_id') if customer else None
    user = CustomUser.objects.filter(id=user_id).first()

    lines = invoice_data.get('lines', {}).get('data', [])
    if lines:
        pricing = lines[0].get('pricing', {})
        price_details = pricing.get('price_details', {})
        price_id = price_details.get('price')
        product_id = price_details.get('product')
    else:
        price_id = None
        product_id = None

    if stripe_subscription_id and user:
        invoice_id = invoice_data.get('id')
        Payment.objects.create(
            user=user,
            stripe_invoice_id=invoice_id,
            stripe_subscription_id=stripe_subscription_id,
            stripe_product_id=product_id,
            stripe_price_id=price_id,
            stripe_customer_id=customer_id,
            is_active=True,
        )
        logger.info(
            "handle_payment_succeeded exit event_id=%s org_id=%s invoice_id=%s",
            event_id, org_id, invoice_id,
        )
    else:
        logger.info(
            "handle_payment_succeeded exit event_id=%s org_id=%s — skipped (missing subscription or user)",
            event_id, org_id,
        )


def handle_subscription_updated(subscription_data, event_id=None):
    """Handle subscription updates (plan changes, renewals)."""
    subscription_id = subscription_data['id']
    logger.info("handle_subscription_updated enter event_id=%s subscription_id=%s", event_id, subscription_id)

    try:
        subscription = Subscription.objects.get(stripe_subscription_id=subscription_id)
    except Subscription.DoesNotExist:
        logger.warning("handle_subscription_updated: subscription %s not found, ignoring", subscription_id)
        return

    org_id = subscription.organization_id
    subscription.is_active = subscription_data['status'] == 'active'

    items = subscription_data.get('items', {}).get('data', [])
    if items:
        subscription.start_date = datetime.fromtimestamp(items[0].get('current_period_start', 0))
        subscription.end_date = datetime.fromtimestamp(items[0].get('current_period_end', 0))
        current_price_id = items[0]['price']['id']
        if subscription.plan.stripe_price_id != current_price_id:
            new_plan = Plan.objects.filter(stripe_price_id=current_price_id).first()
            if new_plan:
                subscription.plan = new_plan

    subscription.save()
    logger.info("handle_subscription_updated exit event_id=%s org_id=%s", event_id, org_id)

def handle_payment_failed(invoice_data, event_id=None):
    """Handle failed payment (e.g., expired credit card)."""
    customer_id = invoice_data.get('customer')
    logger.info("handle_payment_failed enter event_id=%s customer_id=%s", event_id, customer_id)
    # Stripe retries automatically; subscription marked inactive via customer.subscription.deleted on final failure.
    logger.info("handle_payment_failed exit event_id=%s customer_id=%s", event_id, customer_id)

def handle_subscription_deleted(subscription_data, event_id=None):
    """Handle subscription cancellation."""
    subscription_id = subscription_data['id']
    logger.info("handle_subscription_deleted enter event_id=%s subscription_id=%s", event_id, subscription_id)

    try:
        subscription = Subscription.objects.get(stripe_subscription_id=subscription_id)
    except Subscription.DoesNotExist:
        logger.warning("handle_subscription_deleted: subscription %s not found, ignoring", subscription_id)
        return

    org_id = subscription.organization_id
    subscription.is_active = False
    subscription.save()
    logger.info("handle_subscription_deleted exit event_id=%s org_id=%s", event_id, org_id)