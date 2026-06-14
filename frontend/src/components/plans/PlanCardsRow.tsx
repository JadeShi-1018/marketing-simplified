'use client';

import PlanCard from '@/components/plans/PlanCard';
import type { Plan } from '@/hooks/usePlan';

interface PlanCardsRowProps {
  plans: Plan[];
  currentPlanId?: number | null;
  currentSeatCount?: number;
  canManagePlans?: boolean;
  onSelect?: (planId: number, seatCount: number) => Promise<void>;
  ctaForPlan?: (plan: Plan, isCurrent: boolean) => string;
  secondary?: boolean;
}

export default function PlanCardsRow({
  plans,
  currentPlanId,
  currentSeatCount,
  canManagePlans = true,
  onSelect,
  ctaForPlan = (plan, isCurrent) => isCurrent ? 'Current plan' : plan.base_price_cents === 0 ? 'Start for free' : 'Start Team',
  secondary = false,
}: PlanCardsRowProps) {
  const activePlans = plans.filter((plan) => !plan.is_archived).slice(0, 2);

  return (
    <section className={secondary ? 'opacity-95' : ''}>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {activePlans.map((plan) => {
          const isCurrent = plan.id === currentPlanId;
          const isTeam = plan.base_price_cents > 0;
          return (
            <PlanCard
              key={plan.id}
              name={plan.name}
              description={plan.desc ?? (isTeam ? 'Built for growing advertising teams.' : 'Perfect for trying out the full workspace.')}
              basePriceCents={plan.base_price_cents}
              monthlyTokenQuota={plan.monthly_token_quota}
              includedSeats={plan.included_seats}
              extraSeatPriceCents={plan.extra_seat_price_cents}
              overagePriceCentsPer1m={plan.overage_price_cents_per_1m}
              currency={plan.currency}
              badge={isTeam && !isCurrent ? 'Most popular' : undefined}
              ctaText={ctaForPlan(plan, isCurrent)}
              planId={plan.id}
              onSubscribe={onSelect}
              isCurrentPlan={isCurrent}
              canManagePlans={canManagePlans}
              variant="card"
              isRecommended={isTeam && !isCurrent}
              ctaVariant={isTeam ? 'primary' : 'secondary'}
              initialSeatCount={isTeam ? (isCurrent ? currentSeatCount : 10) : plan.included_seats}
            />
          );
        })}
      </div>
    </section>
  );
}
