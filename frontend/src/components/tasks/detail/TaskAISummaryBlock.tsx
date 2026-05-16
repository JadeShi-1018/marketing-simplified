'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Sparkles, ChevronDown, ChevronUp, AlertTriangle,
  ArrowUpCircle, CheckSquare, History, HelpCircle, Lightbulb,
  SendHorizonal, Loader2, Paperclip, CheckCircle2, AlertCircle, Eye, EyeOff,
} from 'lucide-react';
import { TaskAPI } from '@/lib/api/taskApi';
import type { TaskAISummaryPayload, TaskAISummaryAttachment } from '@/types/task';

// ── Persistence layer ──────────────────────────────────────────────────────
// In-memory Map: fast access within a session (survives tab/drawer switches)
// localStorage: survives page refresh and tab close
// Both keyed by taskId only. Each stored value includes savedRefreshKey so we
// can detect staleness (task mutated since last generate) without wiping the data.

const _MAX_CACHE_SIZE = 100;
const LS_SUMMARY = 'task_ai_summary';
const LS_QA = 'task_ai_qa';

type StoredSummary = { data: TaskAISummaryPayload; savedUpdatedAt: string };
type StoredQA      = { pairs: { q: string; a: string }[]; savedUpdatedAt: string };

function _cacheSet<V>(map: Map<number, V>, id: number, value: V): void {
  if (map.size >= _MAX_CACHE_SIZE && !map.has(id)) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
  map.set(id, value);
}

function lsGet<T>(prefix: string, taskId: number): T | null {
  try {
    const raw = localStorage.getItem(`${prefix}:${taskId}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch { return null; }
}

function lsSet(prefix: string, taskId: number, value: unknown): void {
  try { localStorage.setItem(`${prefix}:${taskId}`, JSON.stringify(value)); } catch {}
}

function lsDel(prefix: string, taskId: number): void {
  try { localStorage.removeItem(`${prefix}:${taskId}`); } catch {}
}

const _summaryCache = new Map<number, StoredSummary>();
const _qaCache      = new Map<number, StoredQA>();

// Migrate entries saved in the old format (savedRefreshKey: number) to the new
// format (savedUpdatedAt: string). Treats old entries as current so no false
// stale warning is shown on first load after the upgrade.
function normalizeSummary(raw: unknown, currentUpdatedAt: string): StoredSummary {
  const r = raw as any;
  return { data: r.data, savedUpdatedAt: r.savedUpdatedAt ?? currentUpdatedAt };
}
function normalizeQA(raw: unknown, currentUpdatedAt: string): StoredQA {
  const r = raw as any;
  return { pairs: r.pairs ?? [], savedUpdatedAt: r.savedUpdatedAt ?? currentUpdatedAt };
}

// (refreshKey is tracked inside each stored value — no composite key needed)

// ── Section config ─────────────────────────────────────────────────────────

type SummaryStringKey = 'key_decisions' | 'blockers' | 'escalations' | 'action_items' | 'status_changes' | 'unresolved_questions';

const SECTIONS: {
  key: SummaryStringKey;
  label: string;
  icon: typeof Lightbulb;
  iconCls: string;
  bgCls: string;
}[] = [
  { key: 'key_decisions',        label: 'Key Decisions',       icon: Lightbulb,      iconCls: 'text-amber-500',  bgCls: 'bg-amber-50'  },
  { key: 'blockers',             label: 'Blockers',            icon: AlertTriangle,  iconCls: 'text-rose-500',   bgCls: 'bg-rose-50'   },
  { key: 'escalations',         label: 'Escalations',         icon: ArrowUpCircle,  iconCls: 'text-orange-500', bgCls: 'bg-orange-50' },
  { key: 'action_items',        label: 'Action Items',        icon: CheckSquare,    iconCls: 'text-teal-600',   bgCls: 'bg-teal-50'   },
  { key: 'status_changes',      label: 'Status Changes',      icon: History,        iconCls: 'text-blue-500',   bgCls: 'bg-blue-50'   },
  { key: 'unresolved_questions',label: 'Unresolved Questions',icon: HelpCircle,     iconCls: 'text-violet-500', bgCls: 'bg-violet-50' },
];

// ── Summary section ────────────────────────────────────────────────────────

function SummarySection({
  sectionKey, label, icon: Icon, iconCls, bgCls, items,
}: {
  sectionKey: SummaryStringKey;
  label: string;
  icon: typeof Lightbulb;
  iconCls: string;
  bgCls: string;
  items: string[];
}) {
  const [open, setOpen] = useState(true);
  if (items.length === 0) return null;

  return (
    <div className="rounded-lg border border-gray-100 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <div className="flex items-center gap-2">
          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${bgCls}`}>
            <Icon className={`h-3.5 w-3.5 ${iconCls}`} />
          </span>
          <span className="text-[13px] font-semibold text-gray-800">{label}</span>
          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{items.length}</span>
        </div>
        {open
          ? <ChevronUp className="h-3.5 w-3.5 text-gray-300" />
          : <ChevronDown className="h-3.5 w-3.5 text-gray-300" />}
      </button>
      {open && (
        <ul className="border-t border-gray-50 px-3 pb-2 pt-1 space-y-1">
          {items.map((item, i) => (
            <li key={i} className="flex gap-2 text-sm text-gray-700">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-300" />
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Attachments read panel ─────────────────────────────────────────────────

function AttachmentsReadPanel({ attachments }: { attachments: TaskAISummaryAttachment[] }) {
  if (attachments.length === 0) return null;

  return (
    <div className="rounded-lg border border-gray-100 bg-white px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-2">
        <Paperclip className="h-3.5 w-3.5 text-gray-400" />
        <span className="text-[12px] font-semibold text-gray-600">Files read by AI</span>
      </div>
      <ul className="space-y-1.5">
        {attachments.map((att, i) => (
          <li key={i} className="flex items-center gap-2">
            {!att.readable ? (
              <EyeOff className="h-3.5 w-3.5 shrink-0 text-gray-300" />
            ) : att.truncated ? (
              <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
            )}
            <span className="min-w-0 truncate text-[12px] text-gray-700" title={att.name}>
              {att.name}
            </span>
            <span className="ml-auto shrink-0 text-[10px] text-gray-400">
              {!att.readable
                ? 'not readable'
                : att.truncated
                ? 'partial'
                : 'fully read'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Q&A ───────────────────────────────────────────────────────────────────

function QAPanel({ taskId, updatedAt }: { taskId: number; updatedAt: string }) {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);

  // Single source of truth for Q&A history — same pattern as the summary block.
  const [qaStore, setQAStore] = useState<StoredQA | null>(() => {
    const raw = _qaCache.get(taskId) ?? lsGet<StoredQA>(LS_QA, taskId);
    if (!raw) return null;
    const stored = normalizeQA(raw, updatedAt);
    _cacheSet(_qaCache, taskId, stored);
    return stored;
  });

  // Derived — never stale relative to each other.
  // Comparing server-side updatedAt means cross-session and cross-tab mutations
  // are detected, with no false positives on page refresh.
  const pairs = qaStore?.pairs ?? [];
  const stale  = qaStore != null && !!updatedAt && qaStore.savedUpdatedAt !== updatedAt;

  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Sync when task changes or server reports a new updatedAt
  useEffect(() => {
    const raw = _qaCache.get(taskId) ?? lsGet<StoredQA>(LS_QA, taskId);
    if (!raw) { setQAStore(null); return; }
    const stored = normalizeQA(raw, updatedAt);
    _cacheSet(_qaCache, taskId, stored);
    setQAStore(stored);
  }, [taskId, updatedAt]);

  // On mount: jump instantly to bottom
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' });
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  // Smooth scroll on new message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [pairs]);

  const updatePairs = (next: { q: string; a: string }[]) => {
    const stored: StoredQA = { pairs: next, savedUpdatedAt: updatedAt };
    _cacheSet(_qaCache, taskId, stored);
    lsSet(LS_QA, taskId, stored);
    setQAStore(stored);
  };

  const submit = async () => {
    const q = question.trim();
    if (!q || loading) return;
    setQuestion('');
    setLoading(true);
    const currentPairs = _qaCache.get(taskId)?.pairs ?? pairs;
    try {
      const answer = await TaskAPI.askAIQuestion(taskId, q);
      updatePairs([...currentPairs, { q, a: answer }]);
    } catch {
      updatePairs([...currentPairs, { q, a: 'Failed to get an answer. Please try again.' }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const clearHistory = () => {
    _qaCache.delete(taskId);
    lsDel(LS_QA, taskId);
    setQAStore(null);
  };

  return (
    <div className="rounded-lg border border-gray-100 bg-white">
      <div className="flex items-center justify-between border-b border-gray-50 px-3 py-2">
        <span className="text-[13px] font-semibold text-gray-800">Ask about this task</span>
        {pairs.length > 0 && (
          <button
            type="button"
            onClick={clearHistory}
            className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
          >
            Clear history
          </button>
        )}
      </div>
      {stale && (
        <div className="flex items-center gap-2 border-b border-amber-100 bg-amber-50 px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          <p className="text-[11px] text-amber-700">
            This task has changed since your last conversation. Answers may be outdated.
          </p>
        </div>
      )}
      <div className="px-3 py-2 space-y-2">
        {pairs.length > 0 && (
          <div className="max-h-[300px] overflow-y-auto space-y-3 pr-1">
            {pairs.map((p, i) => (
              <div key={i} className="space-y-2">
                {/* User question — right aligned */}
                <div className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-[#3CCED7] px-3 py-2">
                    <p className="text-[12px] font-medium text-white">{p.q}</p>
                  </div>
                </div>
                {/* AI answer — left aligned */}
                <div className="flex justify-start">
                  <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-gray-100 px-3 py-2">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{p.a}</p>
                  </div>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-tl-sm bg-gray-100 px-3 py-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
        {!pairs.length && loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-tl-sm bg-gray-100 px-3 py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
            </div>
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <input
            ref={inputRef}
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
            placeholder="Ask a question..."
            className="min-w-0 flex-1 rounded-md border border-gray-200 px-2.5 py-1.5 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-[#3CCED7] focus:ring-2 focus:ring-[#3CCED7]/30"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!question.trim() || loading}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#3CCED7] text-white transition hover:opacity-90 disabled:opacity-40"
          >
            <SendHorizonal className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function TaskAISummaryBlock({ taskId, updatedAt }: { taskId: number; updatedAt?: string }) {
  const ua = updatedAt ?? '';

  // Single source of truth: summary + savedUpdatedAt in one state atom.
  // Using the server-side updatedAt timestamp means staleness is detected
  // correctly across page refreshes, other tabs, and other users — not just
  // within the current session.
  const [summaryStore, setSummaryStore] = useState<StoredSummary | null>(() => {
    const raw = _summaryCache.get(taskId) ?? lsGet<StoredSummary>(LS_SUMMARY, taskId);
    if (!raw) return null;
    const stored = normalizeSummary(raw, ua);
    _cacheSet(_summaryCache, taskId, stored);
    return stored;
  });

  // Derived — never stale relative to each other.
  // Guard with !!ua so we don't show a warning while the task is still loading.
  const summary      = summaryStore?.data ?? null;
  const summaryStale = summaryStore != null && !!ua && summaryStore.savedUpdatedAt !== ua;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // When taskId or server updatedAt changes, reload from cache.
  useEffect(() => {
    const raw = _summaryCache.get(taskId) ?? lsGet<StoredSummary>(LS_SUMMARY, taskId);
    if (!raw) { setSummaryStore(null); setError(null); return; }
    const stored = normalizeSummary(raw, ua);
    _cacheSet(_summaryCache, taskId, stored);
    setSummaryStore(stored);
    setError(null);
  }, [taskId, ua]);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await TaskAPI.getAISummary(taskId);
      const stored: StoredSummary = { data, savedUpdatedAt: ua };
      _cacheSet(_summaryCache, taskId, stored);
      lsSet(LS_SUMMARY, taskId, stored);
      setSummaryStore(stored);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to generate summary. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const hasContent = summary && SECTIONS.some((s) => summary[s.key].length > 0);

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-[#3CCED7]" />
          <span className="text-[13px] font-semibold text-gray-800">AI Summary</span>
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-md border border-gray-200 px-2.5 py-1 text-[12px] font-medium text-gray-600 transition hover:border-[#3CCED7] hover:text-[#3CCED7] disabled:opacity-50"
        >
          {loading
            ? <><Loader2 className="h-3 w-3 animate-spin" />Generating…</>
            : summary ? 'Regenerate' : 'Generate'}
        </button>
      </div>

      {error && (
        <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>
      )}

      {loading && !summary && (
        <div className="space-y-2">
          {[80, 60, 72].map((w, i) => (
            <div key={i} className={`h-16 w-${w} rounded-lg bg-gray-100 animate-pulse`} />
          ))}
        </div>
      )}

      {summaryStale && summary && (
        <div className="flex items-center gap-2 rounded-md border border-amber-100 bg-amber-50 px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          <p className="text-[11px] text-amber-700">
            This task has changed since this summary was generated. Click <strong>Regenerate</strong> to see the latest information.
          </p>
        </div>
      )}

      {summary && (
        <div className="space-y-2">
          {!hasContent && (
            <p className="text-sm text-gray-400">No significant signals found in this task's history.</p>
          )}
          {SECTIONS.map((s) => (
            <SummarySection
              key={s.key}
              sectionKey={s.key}
              label={s.label}
              icon={s.icon}
              iconCls={s.iconCls}
              bgCls={s.bgCls}
              items={summary[s.key]}
            />
          ))}
          {summary._attachments && summary._attachments.length > 0 && (
            <AttachmentsReadPanel attachments={summary._attachments} />
          )}
        </div>
      )}

      <QAPanel taskId={taskId} updatedAt={ua} />
    </div>
  );
}
