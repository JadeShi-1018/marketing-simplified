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
}: PlanCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [seatCount, setSeatCount] = useState(includedSeats);

  const isFree = basePriceCents === 0;
  const displayPrice = isFree ? 'Free' : `$${(basePriceCents / 100).toFixed(0)} ${currency}`;

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

  const containerClass = variant === 'card'
    ? 'relative bg-white border border-gray-200 rounded-xl shadow-sm'
    : 'relative bg-white border-r border-b border-gray-300';

  return (
    <div className={containerClass}>
      {badge && (
        <div className="absolute top-4 right-4 z-10">
          <span className="text-[10px] uppercase tracking-wide font-semibold px-2 py-1 rounded-full bg-green-600 text-white">
            {badge}
          </span>
        </div>
      )}

      {/* Header */}
      <div className="space-y-2 plan-card-title px-[clamp(1.25*1rem,((1.25-((1.5-1.25)/(90-20)*20))*1rem+((1.5-1.25)/(90-20))*100vw),1.5*1rem)] py-[clamp(1.25*1rem,((1.25-((1.5-1.25)/(90-20)*20))*1rem+((1.5-1.25)/(90-20))*100vw),1.5*1rem)]">
        <div className="font-medium text-[clamp(1.25*1rem,((1.25-((1.5-1.25)/(90-20)*20))*1rem+((1.5-1.25)/(90-20))*100vw),1.5*1rem)]">
          {name}
        </div>
        <div className="text-base font-normal min-h-[4.5rem]">
          <p>{description}</p>
        </div>
      </div>

      {/* Price */}
      <div className="plan-card-price px-[clamp(1.25*1rem,((1.25-((1.5-1.25)/(90-20)*20))*1rem+((1.5-1.25)/(90-20))*100vw),1.5*1rem)] pt-[clamp(1.25*1rem,((1.25-((1.5-1.25)/(90-20)*20))*1rem+((1.5-1.25)/(90-20))*100vw),1.5*1rem)]">
        <p className="leading-[1.2] font-semibold text-[clamp(1.375*1rem,((1.375-((2-1.375)/(90-20)*20))*1rem+((2-1.375)/(90-20))*100vw),2*1rem)]">
          {isFree ? (
            'Free'
          ) : (
            <>
              {displayPrice}
              <span className="text-[75%] align-top text-gray-600">/mo</span>
            </>
          )}
        </p>
        <p className="leading-[1.6] text-sm text-gray-500">
          {isFree ? 'No credit card required' : 'Auto-renews monthly · cancel anytime'}
        </p>
      </div>

      {/* Seat calculator (paid plans only, not shown on current plan) */}
      {!isFree && !isCurrentPlan && extraSeatPriceCents !== null && extraSeatPriceCents > 0 && (
        <div className="px-[clamp(1.25*1rem,((1.25-((1.5-1.25)/(90-20)*20))*1rem+((1.5-1.25)/(90-20))*100vw),1.5*1rem)]">
          <SeatCalculator
            basePriceCents={basePriceCents}
            includedSeats={includedSeats}
            extraSeatPriceCents={extraSeatPriceCents}
            onSeatsChange={setSeatCount}
          />
        </div>
      )}

      {/* CTA */}
      <div className="plan-card-cta p-[clamp(1.25*1rem,((1.25-((1.5-1.25)/(90-20)*20))*1rem+((1.5-1.25)/(90-20))*100vw),1.5*1rem)]">
        <button
          onClick={handleSubscribe}
          disabled={isLoading || isCurrentPlan || !canManagePlans}
          className="w-full py-3 text-base font-semibold rounded-lg transition-opacity bg-gradient-to-r from-[#3CCED7] to-[#A6E661] text-gray-900 shadow-sm hover:opacity-95 disabled:opacity-50 disabled:bg-gray-200 disabled:bg-none disabled:cursor-not-allowed disabled:text-gray-500 flex items-center justify-center gap-2"
        >
          {isLoading && <Loader2 className="w-5 h-5 animate-spin" />}
          {isCurrentPlan ? 'Current plan' : ctaText}
        </button>
      </div>

      {/* Token + seat features */}
      <div className="plan-card-features border-t border-gray-200 p-[clamp(1.25*1rem,((1.25-((1.5-1.25)/(90-20)*20))*1rem+((1.5-1.25)/(90-20))*100vw),1.5*1rem)]">
        <div className="flex-1 space-y-3">
          {/* Token billing highlights */}
          <div className="space-y-2">
            <div className="text-[.8rem] font-semibold text-gray-500 uppercase">USAGE</div>
            <ul className="space-y-2">
              <li className="flex items-center justify-between">
                <div className="flex items-center">
                  <Check className="w-5 h-5 text-green-600 mr-2" />
                  <span className="text-base text-gray-900">
                    Tokens/mo:{' '}
                    <span className="font-medium">{formatTokens(monthlyTokenQuota)}</span>
                  </span>
                </div>
              </li>
              <li className="flex items-center justify-between">
                <div className="flex items-center">
                  <Check className="w-5 h-5 text-green-600 mr-2" />
                  <span className="text-base text-gray-900">
                    Seats included:{' '}
                    <span className="font-medium">{includedSeats}</span>
                  </span>
                </div>
              </li>
              {!isFree && extraSeatPriceCents !== null && extraSeatPriceCents > 0 && (
                <li className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Check className="w-5 h-5 text-green-600 mr-2" />
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
                  <Check className="w-5 h-5 text-green-600 mr-2" />
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
                      <Check className="w-5 h-5 text-green-600 mr-2" />
                      <span className="text-base text-gray-900">
                        {feat.label}: <span className="font-medium">{feat.value}</span>
                      </span>
                    </div>
                    <div className="relative">
                      <div className="group/icon">
                        <div className="w-5 h-5 rounded-full flex items-center justify-center cursor-pointer hover:text-[#3CCED7] transition-colors">
                          <Info className="w-4 h-4 text-gray-400 group-hover/icon:text-[#3CCED7]" />
                        </div>
                        <div className="absolute right-0 bottom-6 z-100 hidden group-hover/icon:block w-56 p-2 rounded-md bg-white border border-gray-200 shadow-lg text-[12px] text-gray-700">
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
