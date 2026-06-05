'use client';

import { CalendarDays, ChevronDown, Layers3, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  formatDecisionDayKey,
  type TimelineGranularity,
} from '@/components/decisions/decisionTreeLayout';
import type { DecisionGraphNode, DecisionGraphTopic } from '@/types/decision';

export interface DecisionTreeViewportControls {
  zoomPercent: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onJumpToToday?: () => void;
  showToday?: boolean;
}

interface Props {
  nodes: DecisionGraphNode[];
  topics?: DecisionGraphTopic[];
  onJumpToDate: (dayKey: string) => void;
  onJumpToNode: (node: DecisionGraphNode) => void;
  onJumpToTopic?: (topic: string) => void;
  selectedTopic?: string | null;
  viewport?: DecisionTreeViewportControls;
  timelineMode?: 'auto' | TimelineGranularity;
  onTimelineModeChange?: (mode: 'auto' | TimelineGranularity) => void;
  className?: string;
}

const MAX_TITLE_RESULTS = 8;

export default function DecisionTreeNavigator({
  nodes,
  topics = [],
  onJumpToDate,
  onJumpToNode,
  onJumpToTopic,
  selectedTopic = null,
  viewport,
  timelineMode = 'auto',
  onTimelineModeChange,
  className = '',
}: Props) {
  const [dateValue, setDateValue] = useState('');
  const [titleQuery, setTitleQuery] = useState('');
  const [titleOpen, setTitleOpen] = useState(false);
  const titleWrapRef = useRef<HTMLDivElement>(null);

  const topicItems = useMemo(() => {
    const counts = new Map<string, number>();
    const labels = new Map<string, string>();
    topics.forEach((topic) => {
      if (!topic.topic) return;
      counts.set(topic.topic, 0);
      labels.set(topic.topic, topic.title || topic.defaultTitle || topic.topic);
    });
    nodes.forEach((node) => {
      const key = node.topic || 'other';
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (!labels.has(key)) labels.set(key, node.topicLabel || key);
    });
    return Array.from(counts.entries())
      .map(([topic, count]) => ({ topic, count, title: labels.get(topic) || topic }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [nodes, topics]);

  const { minDate, maxDate } = useMemo(() => {
    const keys: string[] = [];
    nodes.forEach((n) => {
      const key = formatDecisionDayKey(n.createdAt);
      if (key !== 'Unknown') keys.push(key);
    });
    const sorted = [...new Set(keys)].sort();
    return {
      minDate: sorted[0] ?? '',
      maxDate: sorted[sorted.length - 1] ?? '',
    };
  }, [nodes]);

  const titleMatches = useMemo(() => {
    const q = titleQuery.trim().toLowerCase();
    if (q.length < 1) return [];
    return nodes
      .filter((n) => {
        const title = (n.title ?? '').toLowerCase();
        const seq = n.projectSeq != null ? `#${n.projectSeq}` : '';
        return title.includes(q) || seq.includes(q);
      })
      .slice(0, MAX_TITLE_RESULTS);
  }, [nodes, titleQuery]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!titleWrapRef.current?.contains(e.target as Node)) {
        setTitleOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const canJumpToDate =
    Boolean(dateValue) &&
    (!minDate || dateValue >= minDate) &&
    (!maxDate || dateValue <= maxDate);

  const handleDateGo = () => {
    if (!canJumpToDate) return;
    onJumpToDate(dateValue);
  };

  const controlClass =
    'h-9 rounded-md border border-slate-200 bg-white text-sm text-slate-900 outline-none transition focus:border-[#3CCED7] focus:ring-1 focus:ring-[#3CCED7]/30';

  return (
    <div
      className={`rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm ${className}`}
      role="search"
      aria-label="Find decisions on the tree"
    >
      <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <div className="flex shrink-0 items-center gap-2">
            <div className="relative">
              <CalendarDays
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="date"
                value={dateValue}
                min={minDate || undefined}
                max={maxDate || undefined}
                onChange={(e) => setDateValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleDateGo()}
                className={`${controlClass} w-[160px] px-3 pl-8`}
                aria-label="Jump to date"
                title={minDate && maxDate ? `Decisions between ${minDate} and ${maxDate}` : undefined}
              />
            </div>
            <button
              type="button"
              onClick={handleDateGo}
              disabled={!canJumpToDate}
              className="h-9 shrink-0 rounded-md bg-slate-900 px-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
            >
              Go
            </button>
          </div>

          <div ref={titleWrapRef} className="relative w-full min-w-[220px] flex-1 sm:max-w-[360px]">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={titleQuery}
                onChange={(e) => {
                  setTitleQuery(e.target.value);
                  setTitleOpen(true);
                }}
                onFocus={() => setTitleOpen(true)}
                placeholder="Search by title…"
                className={`${controlClass} w-full px-3 pl-8 pr-8`}
                aria-label="Search decisions by title"
                aria-controls="decision-tree-title-results"
              />
              {titleQuery ? (
                <button
                  type="button"
                  onClick={() => {
                    setTitleQuery('');
                    setTitleOpen(false);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
            {titleOpen && titleQuery.trim() && titleMatches.length > 0 ? (
              <ul
                id="decision-tree-title-results"
                className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-[0_16px_36px_rgba(15,23,42,0.14)]"
                role="listbox"
              >
                {titleMatches.map((node) => (
                  <li key={node.id} role="option" aria-selected={false}>
                    <button
                      type="button"
                      className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-[14px] transition hover:bg-slate-50"
                      onClick={() => {
                        onJumpToNode(node);
                        setTitleOpen(false);
                      }}
                    >
                      <span className="line-clamp-2 font-medium text-gray-900">
                        {node.title?.trim() || 'Untitled'}
                      </span>
                      <span className="text-[12px] text-gray-500">
                        {node.projectSeq != null ? `#${node.projectSeq}` : ''}
                        {node.projectSeq != null && node.createdAt ? ' · ' : ''}
                        {node.createdAt ? formatDecisionDayKey(node.createdAt) : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {titleOpen && titleQuery.trim() && titleMatches.length === 0 ? (
              <p className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-gray-500 shadow-[0_16px_36px_rgba(15,23,42,0.14)]">
                No matching decisions
              </p>
            ) : null}
          </div>

          {onJumpToTopic && topicItems.length > 0 ? (
            <div className="relative w-full min-w-[220px] shrink-0 sm:w-[300px]">
              <Layers3
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <select
                value={selectedTopic ?? ''}
                onChange={(event) => {
                  const topic = event.target.value;
                  if (!topic) return;
                  onJumpToTopic(topic);
                }}
                className={`${controlClass} w-full cursor-pointer appearance-none px-3 pl-8 pr-8 font-medium`}
                aria-label="Jump to topic"
                title="Jump to topic"
              >
                <option value="">Topics</option>
                {topicItems.map((item) => (
                  <option key={item.topic} value={item.topic}>
                    {item.title} ({item.count})
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
            </div>
          ) : null}
        </div>

        {viewport ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 xl:justify-end xl:border-l xl:border-slate-100 xl:pl-3">
            {onTimelineModeChange ? (
              <div
                className="flex h-9 items-center rounded-md border border-slate-200 bg-slate-50 p-0.5"
                aria-label="Timeline grouping"
              >
                {(['auto', 'day', 'week', 'month'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => onTimelineModeChange(mode)}
                    className={`h-7 rounded border px-2.5 text-xs font-semibold capitalize transition ${
                      timelineMode === mode
                        ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                        : 'border-transparent text-slate-500 hover:bg-white hover:text-slate-800'
                    }`}
                    aria-pressed={timelineMode === mode}
                  >
                    {mode === 'auto' ? 'Topics' : mode}
                  </button>
                ))}
              </div>
            ) : null}
            {viewport.showToday !== false && viewport.onJumpToToday ? (
              <button
                type="button"
                onClick={viewport.onJumpToToday}
                className="h-9 shrink-0 rounded-md bg-slate-900 px-3 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                Today
              </button>
            ) : null}
            <div className="flex h-9 items-center gap-0.5 rounded-md border border-slate-200 bg-slate-50 px-1">
              <button
                type="button"
                onClick={viewport.onZoomOut}
                className="inline-flex h-7 w-7 items-center justify-center rounded text-[15px] text-slate-500 transition hover:bg-white hover:text-slate-900"
                aria-label="Zoom out"
              >
                −
              </button>
              <span className="min-w-[46px] text-center text-sm font-medium tabular-nums text-slate-600">
                {viewport.zoomPercent}%
              </span>
              <button
                type="button"
                onClick={viewport.onZoomIn}
                className="inline-flex h-7 w-7 items-center justify-center rounded text-[15px] text-slate-500 transition hover:bg-white hover:text-slate-900"
                aria-label="Zoom in"
              >
                +
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
