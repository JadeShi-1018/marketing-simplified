'use client';

import React from 'react';
import { TierType, TIER_LABELS, TIER_COLORS } from '@/types/csm';

interface TierBadgeProps {
  tier: TierType;
  className?: string;
}

const TierBadge: React.FC<TierBadgeProps> = ({ tier, className = '' }) => {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${TIER_COLORS[tier]} ${className}`}
    >
      {TIER_LABELS[tier]}
    </span>
  );
};

export default TierBadge;
