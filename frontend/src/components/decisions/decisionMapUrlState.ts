import type { ReadonlyURLSearchParams } from 'next/navigation';
import type { TimelineGranularity } from '@/components/decisions/decisionTreeLayout';

export type DecisionMapMode = 'auto' | 'tree' | TimelineGranularity;

export type DecisionMapUrlState = {
  mode: DecisionMapMode;
  fullscreen: boolean;
  decisionId: number | null;
};

const MAP_PARAM = 'map';
const FULLSCREEN_PARAM = 'fullscreen';
const DECISION_PARAM = 'decision';

const VALID_MAP_MODES = new Set<string>(['auto', 'graph', 'day', 'week', 'month']);

export function parseDecisionMapModeFromUrl(value: string | null): DecisionMapMode {
  if (!value || !VALID_MAP_MODES.has(value)) return 'auto';
  if (value === 'graph') return 'tree';
  return value as DecisionMapMode;
}

export function decisionMapModeToUrl(mode: DecisionMapMode): string | null {
  if (mode === 'auto') return null;
  if (mode === 'tree') return 'graph';
  return mode;
}

export function readDecisionMapUrlState(
  searchParams: Pick<ReadonlyURLSearchParams, 'get'>,
): DecisionMapUrlState {
  const decisionRaw = searchParams.get(DECISION_PARAM);
  const parsedDecisionId = decisionRaw ? Number(decisionRaw) : null;
  return {
    mode: parseDecisionMapModeFromUrl(searchParams.get(MAP_PARAM)),
    fullscreen: searchParams.get(FULLSCREEN_PARAM) === '1',
    decisionId: Number.isFinite(parsedDecisionId) ? parsedDecisionId : null,
  };
}

export function buildDecisionMapSearchParams(
  current: Pick<ReadonlyURLSearchParams, 'toString'>,
  next: DecisionMapUrlState,
): URLSearchParams {
  const params = new URLSearchParams(current.toString());
  const mapValue = decisionMapModeToUrl(next.mode);
  if (mapValue) params.set(MAP_PARAM, mapValue);
  else params.delete(MAP_PARAM);

  if (next.fullscreen) params.set(FULLSCREEN_PARAM, '1');
  else params.delete(FULLSCREEN_PARAM);

  if (next.fullscreen && next.decisionId != null) {
    params.set(DECISION_PARAM, String(next.decisionId));
  } else {
    params.delete(DECISION_PARAM);
  }

  return params;
}

export function mergeDecisionMapUrlState(
  current: DecisionMapUrlState,
  patch: Partial<DecisionMapUrlState>,
): DecisionMapUrlState {
  const next: DecisionMapUrlState = {
    mode: patch.mode ?? current.mode,
    fullscreen: patch.fullscreen ?? current.fullscreen,
    decisionId: patch.decisionId !== undefined ? patch.decisionId : current.decisionId,
  };
  if (!next.fullscreen) next.decisionId = null;
  return next;
}

export function readDecisionMapUrlStateFromLocation(): DecisionMapUrlState {
  if (typeof window === 'undefined') {
    return { mode: 'auto', fullscreen: false, decisionId: null };
  }
  return readDecisionMapUrlState(new URLSearchParams(window.location.search));
}
