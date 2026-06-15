'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Skeleton } from '@/components/ui/skeleton';
import FeatureComparisonTable from '@/components/plans/FeatureComparisonTable';
import OrderHistory from '@/components/plans/OrderHistory';
import PlanCardsRow from '@/components/plans/PlanCardsRow';
import PricingFAQ from '@/components/plans/PricingFAQ';
import SubscriptionUsageCard from '@/components/plans/SubscriptionUsageCard';
import ConfirmModal from '@/components/ui/ConfirmModal';
import usePlan from '@/hooks/usePlan';
import { useAuthStore } from '@/lib/authStore';
import { Check, Sparkles, Star, X } from 'lucide-react';
import { formatTokens } from '@/lib/format';
import toast from 'react-hot-toast';

// Which plan tier gets the "recommended" emphasis (teal ring + lift). Frontend-only
// constant — matched against plan.name — so it needs no DB field or serializer change.
function SubscriptionSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-10 w-32 mt-2" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <div className="pt-4 space-y-2 border-t border-gray-200">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-36" />
          </div>
        </div>
      ))}
    </div>
  );
}

interface ConfirmState {
  proration_now_cents: number;
  monthly_total_cents: number;
  proration_date: number;
  seat_count: number;
}

function ManageSeatsBlock({
  subscription,
  isOrgAdmin,
  previewSeatPurchase,
  purchaseSeats,
}: {
  subscription: NonNullable<ReturnType<typeof usePlan>['subscription']>;
  isOrgAdmin: boolean;
  previewSeatPurchase: ReturnType<typeof usePlan>['previewSeatPurchase'];
  purchaseSeats: ReturnType<typeof usePlan>['purchaseSeats'];
}) {
  const isFree = subscription.plan.base_price_cents === 0;
  const [inputValue, setInputValue] = useState(String(subscription.seat_count));
  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [seatsJustUpdated, setSeatsJustUpdated] = useState(false);

  if (isFree) {
    return (
      <div className="mb-6 rounded-xl border border-gray-200 bg-gray-50 p-5 text-sm text-gray-600">
        Upgrade to Team to manage seats.
      </div>
    );
  }

  const handlePreview = async () => {
    const n = parseInt(inputValue, 10);
    if (isNaN(n) || n < 1) {
      toast.error('Enter a valid seat count.');
      return;
    }
    setPreviewing(true);
    try {
      const preview = await previewSeatPurchase(n);
      setConfirmState({ ...preview, seat_count: n });
    } catch (err: any) {
      const code = err?.response?.data?.code;
      if (code === 'SEAT_COUNT_NOT_INCREASED') {
        toast.error(`Seat count must be greater than current (${subscription.seat_count}).`);
      } else if (code === 'SEAT_COUNT_BELOW_MEMBERS') {
        toast.error(`Seat count cannot be less than current member count (${subscription.member_count}).`);
      } else {
        toast.error(err?.response?.data?.error || 'Failed to preview seat purchase.');
      }
    } finally {
      setPreviewing(false);
    }
  };

  const handleConfirm = async () => {
    if (!confirmState) return;
    setConfirming(true);
    try {
      const result = await purchaseSeats(confirmState.seat_count, confirmState.proration_date);
      toast.success(`Seats updated to ${result.seat_count}.`);
      setInputValue(String(result.seat_count + 1));
      setConfirmState(null);
      // Brief inline highlight on the seat stat so the change is felt, not just toasted.
      setSeatsJustUpdated(true);
      window.setTimeout(() => setSeatsJustUpdated(false), 2000);
    } catch (err: any) {
      const code = err?.response?.data?.code;
      if (code === 'SEAT_COUNT_NOT_INCREASED') {
        toast.error(`Seat count must be greater than current (${subscription.seat_count}).`);
      } else if (code === 'SEAT_COUNT_BELOW_MEMBERS') {
        toast.error(`Seat count cannot be less than current member count (${subscription.member_count}).`);
      } else {
        toast.error(err?.response?.data?.error || 'Failed to update seats.');
      }
      setConfirmState(null);
    } finally {
      setConfirming(false);
    }
  };

  const includedSeats = subscription.plan.included_seats ?? 1;
  const extraSeatCents = subscription.plan.extra_seat_price_cents ?? 0;
  const baseCents = subscription.plan.base_price_cents ?? 0;
  const n = parseInt(inputValue, 10);
  const previewExtra = !isNaN(n) && n > subscription.seat_count ? n - includedSeats : null;
  const previewTotal =
    previewExtra !== null ? baseCents + previewExtra * extraSeatCents : null;

  return (
    <div className="mb-6 rounded-xl border border-[#3CCED7]/30 bg-white p-5 animate-in fade-in duration-200 ease-out motion-reduce:animate-none">
      <div className="mb-3 text-sm font-semibold text-gray-800">Manage Seats</div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-gray-600">
        <div>
          <span className="font-medium text-gray-900">{subscription.member_count}</span>{' '}
          member{subscription.member_count !== 1 ? 's' : ''}
        </div>
        <div>
          <span
            className={`font-medium text-gray-900 transition-colors duration-300 ${
              seatsJustUpdated ? 'rounded bg-[#3CCED7]/15 px-1.5 py-0.5' : ''
            }`}
          >
            {subscription.seat_count}
          </span>{' '}
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
        <>
          <div className="mt-4 flex items-center gap-3">
            <label className="text-sm text-gray-600">New seat count:</label>
            <input
              type="number"
              min={subscription.seat_count + 1}
              value={inputValue}
              onChange={(e) => { setInputValue(e.target.value); setConfirmState(null); }}
              disabled={confirming}
              className="w-24 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-[#3CCED7] focus:outline-none focus:ring-2 focus:ring-[#3CCED7] focus:ring-offset-1 disabled:opacity-50"
            />
            <button
              onClick={handlePreview}
              disabled={previewing || confirming}
              className="rounded-lg bg-[#3CCED7] px-4 py-1.5 text-sm font-medium text-white transition-colors duration-200 ease-out hover:bg-[#2AB5BD] disabled:opacity-50"
            >
              {previewing ? 'Calculating…' : 'Purchase seats'}
            </button>
            {previewTotal !== null && !confirmState && (
              <span className="text-xs text-gray-500">
                ≈ ${(previewTotal / 100).toFixed(2)}/mo
              </span>
            )}
          </div>
          {confirmState && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm animate-in fade-in slide-in-from-top-2 duration-200 ease-out motion-reduce:animate-none">
              <div className="font-medium text-gray-800 mb-1">
                Confirm purchase — {confirmState.seat_count} seats
              </div>
              <p className="text-gray-600">
                You&apos;ll be charged{' '}
                <span className="font-semibold text-gray-900">
                  ${(confirmState.proration_now_cents / 100).toFixed(2)}
                </span>{' '}
                now (prorated for the rest of this billing period), then{' '}
                <span className="font-semibold text-gray-900">
                  ${(confirmState.monthly_total_cents / 100).toFixed(2)}/mo
                </span>{' '}
                going forward.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={handleConfirm}
                  disabled={confirming}
                  className="rounded-lg bg-[#3CCED7] px-4 py-1.5 text-sm font-medium text-white transition-colors duration-200 ease-out hover:bg-[#2AB5BD] disabled:opacity-50"
                >
                  {confirming ? 'Processing…' : 'Confirm purchase'}
                </button>
                <button
                  onClick={() => setConfirmState(null)}
                  disabled={confirming}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-1.5 text-sm font-medium text-gray-700 transition-colors duration-200 ease-out hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SubscriptionV2Content() {
  const {
    plans,
    loading,
    error,
    handleSubscribe,
    subscription,
    previewSeatPurchase,
    purchaseSeats,
    cancelSubscription,
    fetchPayments,
    fetchOrgTokenSummary,
  } = usePlan();
  const user = useAuthStore((s) => s.user);
  const currentPlanId = user?.organization?.plan_id ?? null;
  const isOrgAdmin = !!user?.roles?.includes('Organization Admin');

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelScheduledDate, setCancelScheduledDate] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [showUpgradeSuccess, setShowUpgradeSuccess] = useState(false);

  // Returning from Stripe Checkout (success_url carries ?checkout=success): show a
  // deliberate success state instead of silently landing back on the page. The ref
  // guard + router.replace ensure it fires exactly once and the param is stripped.
  const router = useRouter();
  const searchParams = useSearchParams();
  const checkoutHandled = useRef(false);
  useEffect(() => {
    if (searchParams.get('checkout') === 'success' && !checkoutHandled.current) {
      checkoutHandled.current = true;
      setShowUpgradeSuccess(true);
      router.replace('/subscription');
    }
  }, [searchParams, router]);

  // Auto-dismiss the success banner after a beat; it's also manually dismissable.
  useEffect(() => {
    if (!showUpgradeSuccess) return;
    const t = setTimeout(() => setShowUpgradeSuccess(false), 8000);
    return () => clearTimeout(t);
  }, [showUpgradeSuccess]);

  useEffect(() => {
    if (subscription?.cancel_at_period_end && subscription.end_date) {
      setCancelScheduledDate(
        new Date(subscription.end_date).toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric',
        })
      );
    } else {
      setCancelScheduledDate(null);
    }
  }, [subscription]);

  const currentPlan = plans.find((p) => p.id === currentPlanId) ?? null;
  const isPaidPlan = currentPlan ? currentPlan.base_price_cents > 0 : false;

  const activePlans = plans.filter((p) => !p.is_archived);
  const displayCurrency = currentPlan?.currency ?? activePlans[0]?.currency ?? 'USD';

  // For the post-checkout success banner: prefer the freshly-fetched subscription's
  // plan (reflects the upgrade the moment the webhook lands); fall back to the
  // org's current plan. Stays null until either resolves, so the banner can show
  // graceful "activating…" copy if we beat the webhook back to the page.
  const upgradedPlanName = subscription?.plan?.name ?? currentPlan?.name ?? null;
  const upgradedPlan = upgradedPlanName
    ? plans.find((p) => p.name === upgradedPlanName) ?? null
    : null;

  const currentMonthlyCents = subscription
    ? (subscription.plan.base_price_cents ?? 0) +
      Math.max(0, subscription.seat_count - (subscription.plan.included_seats ?? 1)) *
      (subscription.plan.extra_seat_price_cents ?? 0)
    : 0;

  const periodEndDate = subscription?.end_date
    ? new Date(subscription.end_date).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      })
    : 'the end of your billing period';

  const handleCancelConfirm = async () => {
    setCancelling(true);
    try {
      const result = await cancelSubscription();
      const dateStr = result.cancel_at
        ? new Date(result.cancel_at * 1000).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
          })
        : periodEndDate;
      setCancelScheduledDate(dateStr);
      toast.success(`Subscription will cancel on ${dateStr}. You'll keep Team until then.`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to cancel subscription.');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="mx-auto max-w-5xl">
          {/* Post-checkout success moment — on-brand, dismissable, auto-clears. */}
          {showUpgradeSuccess && (
            <div className="mb-6 overflow-hidden rounded-xl border border-[#3CCED7]/40 bg-gradient-to-r from-[#3CCED7]/10 to-[#A6E661]/10 p-5 animate-in fade-in slide-in-from-top-2 duration-300 ease-out motion-reduce:animate-none">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#3CCED7] to-[#A6E661] shadow-sm">
                  <Check className="h-5 w-5 text-white" strokeWidth={3} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-base font-semibold text-gray-900">
                    {upgradedPlanName ? `Welcome to ${upgradedPlanName} 🎉` : 'Payment successful 🎉'}
                  </div>
                  <p className="mt-0.5 text-sm text-gray-600">
                    {upgradedPlanName ? (
                      <>
                        Your {upgradedPlanName} plan is active
                        {upgradedPlan && (
                          <>
                            {' — '}
                            {formatTokens(upgradedPlan.monthly_token_quota)} tokens/month,{' '}
                            {upgradedPlan.included_seats} seat
                            {upgradedPlan.included_seats === 1 ? '' : 's'} included
                          </>
                        )}
                        .
                      </>
                    ) : (
                      'Your new plan is being activated and will appear here shortly.'
                    )}
                  </p>
                </div>
                <button
                  onClick={() => setShowUpgradeSuccess(false)}
                  aria-label="Dismiss"
                  className="flex-shrink-0 rounded text-gray-400 transition-colors duration-200 ease-out hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#3CCED7] focus:ring-offset-1"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
          )}

          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-gray-900">Plans &amp; Billing</h1>
            <p className="mt-1 text-sm text-gray-500">
              Manage seats and usage, review invoices, or choose the right plan for your team.
            </p>
          </div>

          {/* Seat management band */}
          {subscription && (
            <ManageSeatsBlock
              subscription={subscription}
              isOrgAdmin={isOrgAdmin}
              previewSeatPurchase={previewSeatPurchase}
              purchaseSeats={purchaseSeats}
            />
          )}

          {/* Current plan banner */}
          <div className="mb-6 grid gap-6 lg:grid-cols-2">
          {currentPlan ? (
            <div className="rounded-xl border border-[#3CCED7]/30 bg-gradient-to-br from-[#3CCED7]/5 to-[#A6E661]/5 p-6 shadow-sm animate-in fade-in duration-200 ease-out motion-reduce:animate-none">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-[#3CCED7]">
                    Current Plan
                  </div>
                  <div className="mt-1 text-2xl font-semibold text-gray-900">
                    {currentPlan.name}
                  </div>
                </div>
                {currentPlan.base_price_cents === 0 ? (
                  <div aria-hidden className="relative flex h-16 w-16 items-center justify-center rounded-full bg-[#3CCED7]/10 text-[#3CCED7]">
                    <Star className="h-8 w-8" />
                    <Sparkles className="absolute right-1 top-1 h-4 w-4" />
                    <Sparkles className="absolute bottom-2 left-1 h-3 w-3" />
                  </div>
                ) : (
                  <div className="text-right">
                    <div className="text-2xl font-semibold text-gray-950">
                      {`$${(currentMonthlyCents / 100).toFixed(0)}`}
                    </div>
                    <div className="text-xs text-gray-500">{displayCurrency} / month</div>
                  </div>
                )}
              </div>
              <div className="mt-5 rounded-lg border border-white/80 bg-white/70 p-4 text-sm text-gray-600">
                <div className="flex justify-between"><span>Seats</span><span className="font-medium text-gray-900">{subscription?.seat_count ?? currentPlan.included_seats}</span></div>
                <div className="mt-2 flex justify-between"><span>Monthly tokens</span><span className="font-medium text-gray-900">{formatTokens(currentPlan.monthly_token_quota)}</span></div>
              </div>
              {isPaidPlan && (
                <div className="mt-3 flex items-center justify-between border-t border-[#3CCED7]/20 pt-3">
                  {cancelScheduledDate ? (
                    <p className="text-xs text-amber-600">
                      Cancels on {cancelScheduledDate}, then moves to Free.
                    </p>
                  ) : (
                    <p className="text-xs text-gray-500">
                      {subscription?.end_date
                        ? `Renews on ${periodEndDate} · $${(currentMonthlyCents / 100).toFixed(2)} ${displayCurrency}/mo`
                        : 'Auto-renews monthly · cancel anytime'}
                    </p>
                  )}
                  {isOrgAdmin && !cancelScheduledDate && (
                    <button
                      onClick={() => setShowCancelConfirm(true)}
                      className="ml-4 rounded-lg border border-red-200 px-3 py-1 text-xs text-red-600 transition-colors duration-200 ease-out hover:bg-red-50 whitespace-nowrap"
                    >
                      Cancel subscription
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : !loading && !error && activePlans.length > 0 ? (
            <div className="mb-6 rounded-xl border border-gray-200 bg-gray-50 p-5">
              <div className="text-sm text-gray-700">
                You don&apos;t have an active subscription yet. Pick a plan below to get started.
              </div>
            </div>
          ) : <Skeleton className="h-64 w-full rounded-xl" />}
            <SubscriptionUsageCard fetchSummary={fetchOrgTokenSummary} />
          </div>

          {isPaidPlan && <div className="mb-10"><OrderHistory fetchPayments={fetchPayments} hideWhenEmpty /></div>}

          <ConfirmModal
            isOpen={showCancelConfirm}
            onClose={() => setShowCancelConfirm(false)}
            onConfirm={handleCancelConfirm}
            title="Cancel subscription?"
            message={`You'll keep ${currentPlan?.name ?? 'Team'} access until ${periodEndDate}, then move to Free. This cannot be undone.`}
            confirmText="Yes, cancel"
            cancelText="Keep subscription"
            type="danger"
            loading={cancelling}
          />

          {/* Error */}
          {error && (
            <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Plans + pricing note — wrapped in ONE centered max-w-3xl column so the
              caption aligns directly under the cards (sharing their left/right edges).
              The banner and Manage Seats above intentionally stay at max-w-5xl. */}
          <div className="space-y-12">
            <section>
              <div className="mb-5">
                <h2 className="text-xl font-semibold text-gray-950">
                  {isPaidPlan ? 'Your plan entitlements' : 'Choose the plan that fits your team'}
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  {isPaidPlan
                    ? 'Review your current Team pricing and the Free fallback.'
                    : 'Upgrade when you need more seats, tokens, and billing tools.'}
                </p>
              </div>
              {loading ? (
                <SubscriptionSkeleton />
              ) : activePlans.length === 0 && !error ? (
                <div className="rounded-xl border border-dashed border-gray-300 py-12 text-center">
                  <p className="text-sm text-gray-500">No plans available at the moment.</p>
                </div>
              ) : (
                <PlanCardsRow
                  plans={activePlans}
                  currentPlanId={currentPlanId}
                  currentSeatCount={subscription?.seat_count}
                  canManagePlans={isOrgAdmin}
                  onSelect={handleSubscribe}
                  ctaForPlan={(_, isCurrent) => isCurrent ? 'Current plan' : currentPlanId ? 'Switch plan' : 'Upgrade to Team'}
                  secondary={isPaidPlan}
                />
              )}
            </section>
            <FeatureComparisonTable plans={activePlans} />
            <PricingFAQ />
            <p className="mt-6 text-xs text-gray-500">
              All prices in {displayCurrency}. Billing is handled securely by Stripe.
            </p>
          </div>
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
          <div className="mx-auto max-w-3xl">
            <SubscriptionSkeleton />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
