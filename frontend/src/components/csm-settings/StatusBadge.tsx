'use client';

import { ACTIVE_BADGE_CLASS, INACTIVE_BADGE_CLASS } from './constants';

interface Props {
  active: boolean;
  activeLabel?: string;
  inactiveLabel?: string;
}

export default function StatusBadge({
  active,
  activeLabel = 'Active',
  inactiveLabel = 'Inactive',
}: Props) {
  return (
    <span className={active ? ACTIVE_BADGE_CLASS : INACTIVE_BADGE_CLASS}>
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}
