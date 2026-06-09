'use client';

import { Suspense } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Skeleton } from '@/components/ui/skeleton';
import PlanCard from '@/components/plans/PlanCard';
import usePlan from '@/hooks/usePlan';
import { useAuthStore } from '@/lib/authStore';

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

function SubscriptionV2Content() {
  const { plans, loading, error, handleSubscribe } = usePlan();
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
