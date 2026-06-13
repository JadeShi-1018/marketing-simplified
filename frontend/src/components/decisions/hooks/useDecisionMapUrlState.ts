'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  buildDecisionMapSearchParams,
  mergeDecisionMapUrlState,
  readDecisionMapUrlState,
  type DecisionMapUrlState,
} from '@/components/decisions/decisionMapUrlState';

export function useDecisionMapUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const state = useMemo(() => readDecisionMapUrlState(searchParams), [searchParams]);

  const updateMapUrl = useCallback(
    (patch: Partial<DecisionMapUrlState>) => {
      const next = mergeDecisionMapUrlState(state, patch);
      const params = buildDecisionMapSearchParams(searchParams, next);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams, state],
  );

  return {
    timelineMode: state.mode,
    fullscreen: state.fullscreen,
    fullscreenSelectedId: state.decisionId,
    updateMapUrl,
  };
}
