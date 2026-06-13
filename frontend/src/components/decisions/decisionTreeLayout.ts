import type { DecisionGraphNode } from '@/types/decision';

export type TimelineGranularity = 'day' | 'week' | 'month';

const DAY_MS = 86_400_000;

/** Choose column granularity from the span of decision dates. */
export function pickTimelineGranularity(dateKeys: string[]): TimelineGranularity {
  const times = dateKeys
    .filter((key) => key !== 'Unknown')
    .map((key) => new Date(`${key}T00:00:00`).getTime())
    .filter((t) => !Number.isNaN(t));
  if (times.length === 0) return 'day';
  const spanDays = Math.floor((Math.max(...times) - Math.min(...times)) / DAY_MS) + 1;
  if (spanDays <= 21) return 'day';
  if (spanDays <= 120) return 'week';
  return 'month';
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseBucketDate(bucketKey: string, granularity: TimelineGranularity): Date | null {
  if (bucketKey === 'Unknown') return null;
  if (granularity === 'month') {
    const [y, m] = bucketKey.split('-').map(Number);
    if (!y || !m) return null;
    return new Date(y, m - 1, 1);
  }
  const weekStart = bucketKey.startsWith('week:') ? bucketKey.slice(5) : bucketKey;
  const date = new Date(`${weekStart}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function expandBucketRange(
  keys: string[],
  granularity: TimelineGranularity,
): string[] {
  const dates = keys
    .map((key) => parseBucketDate(key, granularity))
    .filter((date): date is Date => Boolean(date));
  if (dates.length === 0) return keys;

  const start = new Date(Math.min(...dates.map((date) => date.getTime())));
  const end = new Date(Math.max(...dates.map((date) => date.getTime())));
  const expanded: string[] = [];
  const cursor = new Date(start);

  while (cursor.getTime() <= end.getTime()) {
    if (granularity === 'month') {
      expanded.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
      cursor.setMonth(cursor.getMonth() + 1);
    } else if (granularity === 'week') {
      expanded.push(`week:${formatYmd(cursor)}`);
      cursor.setDate(cursor.getDate() + 7);
    } else {
      expanded.push(formatYmd(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  return expanded;
}

/** Map a day key (YYYY-MM-DD) to a bucket key for timeline columns. */
export function bucketDateKey(dateKey: string, granularity: TimelineGranularity): string {
  if (dateKey === 'Unknown' || granularity === 'day') return dateKey;
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  if (granularity === 'month') {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }
  return `week:${formatYmd(startOfWeek(date))}`;
}

export function bucketLabel(
  bucketKey: string,
  granularity: TimelineGranularity,
): string {
  if (bucketKey === 'Unknown') return 'Unknown';
  if (granularity === 'day') {
    const date = new Date(`${bucketKey}T00:00:00`);
    if (Number.isNaN(date.getTime())) return bucketKey;
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
  }
  if (granularity === 'month') {
    const [y, m] = bucketKey.split('-').map(Number);
    const date = new Date(y, (m ?? 1) - 1, 1);
    return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(date);
  }
  const weekStart = bucketKey.startsWith('week:') ? bucketKey.slice(5) : bucketKey;
  const start = new Date(`${weekStart}T00:00:00`);
  if (Number.isNaN(start.getTime())) return bucketKey;
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

export function bucketTooltip(
  bucketKey: string,
  granularity: TimelineGranularity,
  count: number,
): string {
  const label = bucketLabel(bucketKey, granularity);
  const unit =
    granularity === 'day' ? 'day' : granularity === 'week' ? 'week' : 'month';
  return `${label} · ${count} decision${count === 1 ? '' : 's'} (${unit} group)`;
}

/** Calendar day in local timezone (matches HTML date input). */
export function formatDecisionDayKey(value?: string | null): string {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Find the timeline column bucket for a calendar day. */
export function columnForDayKey(
  dayKey: string,
  columns: { dateKey: string }[],
  granularity: TimelineGranularity,
): { dateKey: string } | undefined {
  const bucket = bucketDateKey(dayKey, granularity);
  const exact = columns.find((c) => c.dateKey === bucket);
  if (exact) return exact;
  const target = new Date(`${dayKey}T00:00:00`).getTime();
  if (Number.isNaN(target)) return undefined;
  let nearest = columns[0];
  let nearestDiff = Infinity;
  for (const col of columns) {
    const t = bucketSortTime(col.dateKey, granularity);
    if (Number.isNaN(t)) continue;
    const diff = Math.abs(t - target);
    if (diff < nearestDiff) {
      nearestDiff = diff;
      nearest = col;
    }
  }
  return nearest;
}

export function sortNodesStable(list: DecisionGraphNode[]): DecisionGraphNode[] {
  return [...list].sort((a, b) => {
    const seqA = a.projectSeq ?? Number.MAX_SAFE_INTEGER;
    const seqB = b.projectSeq ?? Number.MAX_SAFE_INTEGER;
    if (seqA !== seqB) return seqA - seqB;
    return a.id - b.id;
  });
}

/** Sort bucket keys chronologically (day / week / month). */
export function sortBucketKeys(keys: string[], granularity: TimelineGranularity): string[] {
  const copy = [...keys];
  copy.sort((a, b) => {
    if (a === 'Unknown') return 1;
    if (b === 'Unknown') return -1;
    const ta = bucketSortTime(a, granularity);
    const tb = bucketSortTime(b, granularity);
    return ta - tb;
  });
  return copy;
}

function bucketSortTime(bucketKey: string, granularity: TimelineGranularity): number {
  if (granularity === 'day') {
    return new Date(`${bucketKey}T00:00:00`).getTime() || 0;
  }
  if (granularity === 'month') {
    const [y, m] = bucketKey.split('-').map(Number);
    return new Date(y, (m ?? 1) - 1, 1).getTime();
  }
  const weekStart = bucketKey.startsWith('week:') ? bucketKey.slice(5) : bucketKey;
  return new Date(`${weekStart}T00:00:00`).getTime() || 0;
}

export type EdgeNodeRect = { x: number; y: number };

export type DecisionEdgeEndpoints = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  sameColumn: boolean;
};

/** Anchor points on card edges facing the other node (timeline-safe routing). */
export function getDecisionEdgeEndpoints(
  from: EdgeNodeRect,
  to: EdgeNodeRect,
  nodeWidth: number,
  nodeHeight: number,
  edgeEndGap: number,
): DecisionEdgeEndpoints {
  const fromCx = from.x + nodeWidth / 2;
  const fromCy = from.y + nodeHeight / 2;
  const toCx = to.x + nodeWidth / 2;
  const toCy = to.y + nodeHeight / 2;
  const dx = toCx - fromCx;
  const dy = toCy - fromCy;
  const sameColumn = from.x === to.x;

  if (sameColumn) {
    return {
      startX: from.x + nodeWidth,
      startY: fromCy,
      endX: to.x + nodeWidth - edgeEndGap,
      endY: toCy,
      sameColumn: true,
    };
  }

  let startX: number;
  let startY = fromCy;
  let endX: number;
  let endY = toCy;

  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx >= 0) {
      startX = from.x + nodeWidth;
      endX = to.x - edgeEndGap;
    } else {
      startX = from.x + edgeEndGap;
      endX = to.x + nodeWidth - edgeEndGap;
    }
  } else {
    startX = fromCx;
    startY = dy >= 0 ? from.y + nodeHeight : from.y;
    endX = toCx;
    endY = dy >= 0 ? to.y - edgeEndGap : to.y + nodeHeight - edgeEndGap;
  }

  return { startX, startY, endX, endY, sameColumn: false };
}

export function buildDecisionEdgePath(endpoints: DecisionEdgeEndpoints): string {
  const { startX, startY, endX, endY, sameColumn } = endpoints;
  const loopOffset = 36;
  if (sameColumn) {
    return `M ${startX} ${startY} C ${startX + loopOffset} ${startY}, ${startX + loopOffset} ${endY}, ${endX} ${endY}`;
  }
  const curve = Math.max(40, Math.abs(endX - startX) / 2);
  if (endX >= startX) {
    return `M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}`;
  }
  return `M ${startX} ${startY} C ${startX - curve} ${startY}, ${endX + curve} ${endY}, ${endX} ${endY}`;
}
