'use client';

import { useState } from 'react';
import { Info, Check, Loader2 } from 'lucide-react';
import SeatCalculator from './SeatCalculator';
import { formatTokens } from '@/lib/format';

interface PlanFeature {
  category?: string;
  label: string;
  value: string | number;
  tooltip: string;
}

interface PlanCardProps {
  name: string;
  description: string;
  // Token-billing pricing
  basePriceCents: number;
  monthlyTokenQuota: number | null;  // null = unlimited
  includedSeats: number;
  extraSeatPriceCents: number | null;
  overagePriceCentsPer1m?: number | null;  // null = hard block
  currency?: string;
  // Legacy feature list (optional)
  features?: PlanFeature[];
  badge?: string;
  ctaText: string;
  planId?: number;
  stripePriceId?: string;
  onSubscribe?: (planId: number, seatCount: number) => Promise<void>;
  isCurrentPlan?: boolean;
  canManagePlans?: boolean;
  variant?: 'grid' | 'card';
  // Recommended-tier emphasis (teal ring + lift). Card variant only — never
  // applied to the full-bleed /plans grid.
  isRecommended?: boolean;
  // CTA emphasis. Card variant only. Defaults to 'primary' so the grid variant
  // and every existing caller keep the gradient CTA unchanged. 'secondary'
  // renders a teal outline button for non-recommended selectable tiers.
  ctaVariant?: 'primary' | 'secondary';
  initialSeatCount?: number;
}


export default function PlanCard({
  name,
  description,
  basePriceCents,
  monthlyTokenQuota,
  includedSeats,
  extraSeatPriceCents,
  overagePriceCentsPer1m,
  currency = 'USD',
  features,
  badge,
  ctaText,
  planId,
  onSubscribe,
  isCurrentPlan,
  canManagePlans = true,
  variant = 'grid',
  isRecommended = false,
  ctaVariant = 'primary',
  initialSeatCount,
}: PlanCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [seatCount, setSeatCount] = useState(
    initialSeatCount ?? (basePriceCents > 0 ? Math.max(includedSeats, 10) : includedSeats),
  );

  const isFree = basePriceCents === 0;
  const totalPriceCents = basePriceCents + Math.max(0, seatCount - includedSeats) * (extraSeatPriceCents ?? 0);

  const handleSubscribe = async () => {
    if (!planId || !onSubscribe || isLoading) return;
    setIsLoading(true);
    try {
      await onSubscribe(planId, seatCount);
    } catch (error) {
      console.error('Error subscribing:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const groupedFeatures = (features ?? []).reduce(
    (acc, feat) => {
      const cat = feat.category ?? 'FEATURES';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(feat);
      return acc;
    },
    {} as Record<string, PlanFeature[]>,
  );

  const isCard = variant === 'card';

  // Card-variant state styling (current > recommended > default). All of this is
  // gated on isCard; the grid variant keeps its full-bleed border-r/border-b box.
  // - current:     neutral gray ring, no teal (you can't upgrade to your own plan)
  // - recommended: teal ring + subtle teal tint + raised elevation and slight lift
  // - default:     plain bordered card
  const cardStateClass = isCurrentPlan
    ? 'bg-white border border-gray-300 ring-1 ring-gray-200 shadow-sm'
    : isRecommended
      ? 'bg-[#3CCED7]/[0.03] border border-gray-200 ring-2 ring-[#3CCED7] shadow-md hover:shadow-lg'
      : 'bg-white border border-gray-200 shadow-sm hover:shadow-md';
  const containerClass = isCard
    ? `relative rounded-xl transition-shadow duration-200 ease-out motion-reduce:transition-none ${cardStateClass}`
    : 'relative bg-white border-r border-b border-gray-300';

  const headerPad = isCard ? 'px-6 pt-6 pb-2' : 'p-6';
  const pricePad = 'px-6 pt-4';
  const seatCalcPad = 'px-6';
  const ctaPad = 'p-6';
  const featuresPad = ctaPad;
  const dividerClass = 'border-gray-200';

  // CTA styling. Secondary (teal outline) is card-variant only and never applies
  // to the current plan (whose button is the disabled "Your current plan" chip).
  // Primary keeps the brand gradient — the default for the grid and every caller.
  const isSecondaryCta = isCard && ctaVariant === 'secondary' && !isCurrentPlan;
  const ctaClass = isSecondaryCta
    ? 'w-full py-3 text-base font-semibold rounded-lg transition-colors duration-200 ease-out border border-[#3CCED7] bg-white text-[#3CCED7] hover:bg-[#3CCED7]/5 focus:outline-none focus:ring-2 focus:ring-[#3CCED7] focus:ring-offset-1 disabled:opacity-50 disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2'
    : 'w-full py-3 text-base font-semibold rounded-lg transition-opacity duration-200 ease-out bg-gradient-to-r from-[#3CCED7] to-[#A6E661] text-gray-900 shadow-sm hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-[#3CCED7] focus:ring-offset-1 disabled:opacity-50 disabled:bg-gray-200 disabled:bg-none disabled:cursor-not-allowed disabled:text-gray-500 flex items-center justify-center gap-2';

  return (
    <div className={containerClass}>
      {badge && (
        <div className="absolute top-4 right-4 z-10">
          <span className="text-[10px] uppercase tracking-wide font-semibold px-2 py-1 rounded-full bg-[#3CCED7] text-gray-900">
            {badge}
          </span>
        </div>
      )}

      {/* Current-plan marker — card variant only, sits in the same slot as the
          Popular pill so the two cards stay top-aligned. */}
      {isCard && isCurrentPlan && !badge && (
        <div className="absolute top-4 right-4 z-10">
          <span className="text-[10px] uppercase tracking-wide font-semibold px-2 py-1 rounded-full bg-gray-100 text-gray-500">
            Current plan
          </span>
        </div>
      )}

      {/* Header */}
      <div className={`space-y-2 plan-card-title ${headerPad}`}>
        <div className="text-2xl font-semibold text-gray-900">
          {name}
        </div>
        <div className="text-sm font-normal text-gray-500">
          <p>{description}</p>
        </div>
      </div>

      {/* Price */}
      <div className={`plan-card-price ${pricePad}`}>
        <p className="text-3xl font-semibold leading-tight text-gray-900">
          {isFree ? (
            `$0 ${currency}`
          ) : (
            <>
              ${(totalPriceCents / 100).toFixed(0)} {currency}
            </>
          )}
          <span className="ml-1 text-sm font-normal text-gray-500">/month</span>
        </p>
        <p className="leading-[1.6] text-sm text-gray-500">
          {isFree
            ? 'No credit card required'
            : `$${(basePriceCents / 100).toFixed(0)} base includes ${includedSeats} seats + $${((extraSeatPriceCents ?? 0) / 100).toFixed(0)}/extra seat`}
        </p>
      </div>

      {/* Seat calculator (paid plans only, not shown on current plan) */}
      {!isFree && !isCurrentPlan && extraSeatPriceCents !== null && extraSeatPriceCents > 0 && (
        <div className={seatCalcPad}>
          <SeatCalculator
            basePriceCents={basePriceCents}
            includedSeats={includedSeats}
            extraSeatPriceCents={extraSeatPriceCents}
            onSeatsChange={setSeatCount}
            initialSeats={seatCount}
            showTotal={false}
          />
        </div>
      )}

      {/* CTA */}
      <div className={`plan-card-cta ${ctaPad}`}>
        <button
          onClick={handleSubscribe}
          disabled={isLoading || isCurrentPlan || !canManagePlans}
          className={ctaClass}
        >
          {isLoading && <Loader2 className="w-5 h-5 animate-spin" />}
          {isCurrentPlan ? (isCard ? 'Your current plan' : 'Current plan') : ctaText}
        </button>
      </div>

      {/* Token + seat features */}
      <div className={`plan-card-features border-t ${dividerClass} ${featuresPad}`}>
        <div className="flex-1 space-y-3">
          {/* Token billing highlights */}
          <div className="space-y-2">
            <div className="text-[.8rem] font-semibold text-gray-500 uppercase">USAGE</div>
            <ul className="space-y-2">
              <li className="flex items-center justify-between">
                <div className="flex items-center">
                  <Check className="w-5 h-5 text-[#3CCED7] mr-2" />
                  <span className="text-base text-gray-900">
                    Tokens/mo:{' '}
                    <span className="font-medium">{formatTokens(monthlyTokenQuota)}</span>
                  </span>
                </div>
              </li>
              <li className="flex items-center justify-between">
                <div className="flex items-center">
                  <Check className="w-5 h-5 text-[#3CCED7] mr-2" />
                  <span className="text-base text-gray-900">
                    Seats included:{' '}
                    <span className="font-medium">{includedSeats}</span>
                  </span>
                </div>
              </li>
              {!isFree && extraSeatPriceCents !== null && extraSeatPriceCents > 0 && (
                <li className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Check className="w-5 h-5 text-[#3CCED7] mr-2" />
                    <span className="text-base text-gray-900">
                      Extra seat:{' '}
                      <span className="font-medium">
                        ${(extraSeatPriceCents / 100).toFixed(0)}/mo
                      </span>
                    </span>
                  </div>
                </li>
              )}
              <li className="flex items-center justify-between">
                <div className="flex items-center">
                  <Check className="w-5 h-5 text-[#3CCED7] mr-2" />
                  <span className="text-base text-gray-900">
                    Overage:{' '}
                    <span className="font-medium">
                      {overagePriceCentsPer1m
                        ? `$${(overagePriceCentsPer1m / 100).toFixed(0)}/1M tokens`
                        : 'Hard block'}
                    </span>
                  </span>
                </div>
              </li>
            </ul>
          </div>

          {/* Legacy feature list (if provided) */}
          {Object.entries(groupedFeatures).map(([category, categoryFeatures]) => (
            <div key={category} className="space-y-2">
              <div className="text-[.8rem] font-semibold text-gray-500 uppercase">{category}</div>
              <ul className="space-y-2">
                {categoryFeatures.map((feat, idx) => (
                  <li key={idx} className="flex items-center justify-between">
                    <div className="flex items-center">
                      <Check className="w-5 h-5 text-[#3CCED7] mr-2" />
                      <span className="text-base text-gray-900">
                        {feat.label}: <span className="font-medium">{feat.value}</span>
                      </span>
                    </div>
                    <div className="relative">
                      <div className="group/icon">
                        <div className="w-5 h-5 rounded-full flex items-center justify-center cursor-pointer hover:text-[#3CCED7] transition-colors duration-200 ease-out">
                          <Info className="w-4 h-4 text-gray-400 group-hover/icon:text-[#3CCED7]" />
                        </div>
                        <div className="absolute right-0 bottom-6 z-[100] hidden group-hover/icon:block w-56 p-2 rounded-lg bg-white border border-gray-200 shadow-lg text-xs text-gray-700">
                          {feat.tooltip}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
