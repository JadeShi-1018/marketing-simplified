'use client';

import { Suspense, useState } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Skeleton } from '@/components/ui/skeleton';
import PlanCard from '@/components/plans/PlanCard';
import usePlan from '@/hooks/usePlan';
import { useAuthStore } from '@/lib/authStore';
import toast from 'react-hot-toast';

function SubscriptionSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-gray-200 bg-white p-6 space-y-4">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-10 w-32 mt-2" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <div className="pt-4 space-y-2 border-t border-gray-100">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-36" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ManageSeatsBlock({
  subscription,
  isOrgAdmin,
  purchaseSeats,
}: {
  subscription: NonNullable<ReturnType<typeof usePlan>['subscription']>;
  isOrgAdmin: boolean;
  purchaseSeats: ReturnType<typeof usePlan>['purchaseSeats'];
}) {
  const isFree = subscription.plan.base_price_cents === 0;
  const [inputValue, setInputValue] = useState(String(subscription.seat_count));
  const [saving, setSaving] = useState(false);

  if (isFree) {
    return (
      <div className="mb-6 rounded-xl border border-gray-200 bg-gray-50 px-5 py-4 text-sm text-gray-600">
        Upgrade to Team to manage seats.
      </div>
    );
  }

  const handleSave = async () => {
    const n = parseInt(inputValue, 10);
    if (isNaN(n) || n < 1) {
      toast.error('Enter a valid seat count.');
      return;
    }
    setSaving(true);
    try {
      const result = await purchaseSeats(n);
      toast.success(`Seats updated to ${result.seat_count}.`);
    } catch (err: any) {
      const code = err?.response?.data?.code;
      if (code === 'SEAT_COUNT_NOT_INCREASED') {
        toast.error(`Seat count must be greater than current (${subscription.seat_count}).`);
      } else if (code === 'SEAT_COUNT_BELOW_MEMBERS') {
        toast.error(`Seat count cannot be less than current member count (${subscription.member_count}).`);
      } else {
        toast.error(err?.response?.data?.error || 'Failed to update seats.');
      }
    } finally {
      setSaving(false);
    }
  };

  const extraSeatCents = subscription.plan.extra_seat_price_cents ?? 0;
  const baseCents = subscription.plan.base_price_cents ?? 0;
  const includedSeats = subscription.plan.included_seats ?? 1;
  const n = parseInt(inputValue, 10);
  const previewExtra = !isNaN(n) && n > subscription.seat_count ? n - includedSeats : null;
  const previewTotal =
    previewExtra !== null ? baseCents + previewExtra * extraSeatCents : null;

  return (
    <div className="mb-6 rounded-xl border border-[#3CCED7]/30 bg-white px-5 py-4">
      <div className="mb-3 text-sm font-semibold text-gray-800">Manage Seats</div>
      <div className="flex flex-wrap items-center gap-6 text-sm text-gray-600">
        <div>
          <span className="font-medium text-gray-900">{subscription.member_count}</span>{' '}
          member{subscription.member_count !== 1 ? 's' : ''}
        </div>
        <div>
          <span className="font-medium text-gray-900">{subscription.seat_count}</span>{' '}
          purchased seat{subscription.seat_count !== 1 ? 's' : ''}
        </div>
        <div>
          <span className="font-medium text-gray-900">
            {subscription.seat_count - subscription.member_count}
          </span>{' '}
          available
        </div>
      </div>
      {isOrgAdmin && (
        <div className="mt-4 flex items-center gap-3">
          <label className="text-sm text-gray-600">New seat count:</label>
          <input
            type="number"
            min={subscription.seat_count + 1}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className="w-24 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-[#3CCED7] focus:outline-none"
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-[#3CCED7] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#2bb8c1] disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Purchase seats'}
          </button>
          {previewTotal !== null && (
            <span className="text-xs text-gray-400">
              ≈ ${(previewTotal / 100).toFixed(2)}/mo
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function SubscriptionV2Content() {
  const { plans, loading, error, handleSubscribe, subscription, purchaseSeats } = usePlan();
  const user = useAuthStore((s) => s.user);
  const currentPlanId = user?.organization?.plan_id ?? null;
  const isOrgAdmin = !!user?.roles?.includes('Organization Admin');

  const currentPlan = plans.find((p) => p.id === currentPlanId) ?? null;

  const currentPlanPrice = currentPlan
    ? currentPlan.base_price_cents === 0
      ? 'Free'
      : `$${(currentPlan.base_price_cents / 100).toFixed(0)}/mo`
    : null;

  const activePlans = plans.filter((p) => !p.is_archived);

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="mx-auto max-w-5xl">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-xl font-semibold text-gray-900">Subscription</h1>
            <p className="mt-1 text-sm text-gray-500">
              Choose the plan that fits your team. Upgrade or downgrade anytime.
            </p>
          </div>

          {/* Current plan banner */}
          {currentPlan ? (
            <div className="mb-6 flex items-center justify-between rounded-xl border border-[#3CCED7]/30 bg-gradient-to-r from-[#3CCED7]/5 to-[#A6E661]/5 px-5 py-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-[#3CCED7]">
                  Current Plan
                </div>
                <div className="mt-0.5 text-base font-semibold text-gray-900">
                  {currentPlan.name}
                </div>
              </div>
              <div className="text-right text-sm text-gray-500">
                {currentPlanPrice}
              </div>
            </div>
          ) : !loading && !error && activePlans.length > 0 ? (
            <div className="mb-6 rounded-xl border border-gray-200 bg-gray-50 px-5 py-4">
              <div className="text-sm text-gray-700">
                You don&apos;t have an active subscription yet. Pick a plan below to get started.
              </div>
            </div>
          ) : null}

          {/* Manage Seats */}
          {subscription && (
            <ManageSeatsBlock
              subscription={subscription}
              isOrgAdmin={isOrgAdmin}
              purchaseSeats={purchaseSeats}
            />
          )}

          {/* Error */}
          {error && (
            <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Plans grid */}
          {loading ? (
            <SubscriptionSkeleton />
          ) : activePlans.length === 0 && !error ? (
            <div className="rounded-xl border border-dashed border-gray-300 py-12 text-center">
              <p className="text-sm text-gray-500">No plans available at the moment.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {activePlans.map((plan, index, arr) => {
                const isCurrent = plan.id === currentPlanId;
                const isPopular = index === arr.length - 2;
                const ctaText = currentPlanId
                  ? isCurrent ? 'Current plan' : 'Switch plan'
                  : 'Subscribe now';
                return (
                  <PlanCard
                    key={plan.id}
                    name={plan.name}
                    description={plan.desc ?? `Professional ${plan.name.toLowerCase()} plan for your organization.`}
                    basePriceCents={plan.base_price_cents}
                    monthlyTokenQuota={plan.monthly_token_quota}
                    includedSeats={plan.included_seats}
                    extraSeatPriceCents={plan.extra_seat_price_cents ?? 0}
                    overagePriceCentsPer1m={plan.overage_price_cents_per_1m}
                    badge={isPopular && !isCurrent ? 'Popular' : undefined}
                    ctaText={ctaText}
                    planId={plan.id}
                    stripePriceId={plan.stripe_price_id ?? undefined}
                    onSubscribe={handleSubscribe}
                    isCurrentPlan={isCurrent}
                    canManagePlans={isOrgAdmin}
                  />
                );
              })}
            </div>
          )}

          <p className="mt-6 text-xs text-gray-400">
            All prices in USD. Billing is handled securely by Stripe.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default function SubscriptionV2Page() {
  return (
    <ProtectedRoute loadingComponent={<SubscriptionV2Skeleton />}>
      <Suspense fallback={<SubscriptionV2Skeleton />}>
        <SubscriptionV2Content />
      </Suspense>
    </ProtectedRoute>
  );
}

function SubscriptionV2Skeleton() {
  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="mx-auto max-w-5xl space-y-6">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-96" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <SubscriptionSkeleton />
        </div>
      </div>
    </DashboardLayout>
  );
}
