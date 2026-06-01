'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import {
  Search, X, Loader2, Plus, User, Hash, Paperclip, Calendar, Link2, MessageSquare, AtSign,
} from 'lucide-react';
import {
  addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, isBefore,
  format as dateFnsFormat, parseISO,
} from 'date-fns';
import { useMessageSearch } from '@/hooks/useMessageSearch';
import { useSearchHistory } from '@/hooks/useSearchHistory';
import { deletedMessageIds } from '@/lib/chatStore';
import type { MessageSearchResult, Chat } from '@/types/chat';
import SearchResultItem from './SearchResultItem';
import type { SearchFilters } from '@/hooks/useMessageSearch';
import { useAuthStore } from '@/lib/authStore';

interface Props {
  projectId: number | null;
  chats?: Chat[];
  onSelectResult: (result: MessageSearchResult) => void;
  onClose: () => void;
  initialFilters?: Partial<SearchFilters>;
  /** Increment to re-apply initialFilters even when the panel is already open. */
  filterSignal?: number;
}

// ── Filter dropdown options ────────────────────────────────────────────────
type FilterKey = 'fromUser' | 'inChat' | 'inConversation' | 'has' | 'dateAfter' | 'dateBefore';

interface FilterOption {
  key: FilterKey;
  label: string;
  shortcut: string;
  icon: React.ReactNode;
}

const FILTER_OPTIONS: FilterOption[] = [
  { key: 'fromUser',       label: 'From someone',    shortcut: 'from:',   icon: <User className="h-4 w-4" /> },
  { key: 'inChat',         label: 'In channel',       shortcut: 'in:',     icon: <Hash className="h-4 w-4" /> },
  { key: 'inConversation', label: 'In conversation',  shortcut: 'in:',     icon: <MessageSquare className="h-4 w-4" /> },
  { key: 'has',            label: 'Has file',         shortcut: 'has:',    icon: <Paperclip className="h-4 w-4" /> },
  { key: 'dateAfter',      label: 'After date',       shortcut: 'after:',  icon: <Calendar className="h-4 w-4" /> },
  { key: 'dateBefore',     label: 'Before date',      shortcut: 'before:', icon: <Calendar className="h-4 w-4" /> },
];

// ── Active filter chip ─────────────────────────────────────────────────────
function FilterChip({ label, icon, onRemove }: { label: string; icon?: React.ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[#3CCED7]/50 bg-[#3CCED7]/10 px-2.5 py-0.5 text-xs font-medium text-[#2AB5BD]">
      {icon && <span className="shrink-0">{icon}</span>}
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 rounded-full p-0.5 hover:bg-[#3CCED7]/20"
        aria-label={`Remove ${label} filter`}
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </span>
  );
}

// ── Quick-toggle chip (preset filter) ─────────────────────────────────────
function QuickChip({
  label, active, onClick,
}: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-[#3CCED7] bg-[#3CCED7]/10 text-[#2AB5BD]'
          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

// ── Compact date picker with month + year navigation ─────────────────────
const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function SearchDatePicker({ value, onChange, onCancel, label }: {
  value: string;
  onChange: (v: string) => void;
  onCancel: () => void;
  label: string;
}) {
  const today = new Date();
  const initial = value ? parseISO(value) : today;
  const [view, setView] = useState<Date>(startOfMonth(initial));
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selectedDate = value ? new Date(`${value}T00:00:00`) : null;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        if (!value) onCancel();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onCancel, value]);

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(view), { weekStartsOn: 0 }),
    end: endOfWeek(endOfMonth(view), { weekStartsOn: 0 }),
  });

  const NavBtn = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
    <button type="button" onClick={onClick}
      className="flex h-5 w-5 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-800 text-sm leading-none">
      {children}
    </button>
  );

  return (
    <div ref={containerRef} className="relative mt-2">
      {/* Trigger row */}
      <div className="flex items-center gap-2 rounded-lg border border-[#3CCED7]/40 bg-[#3CCED7]/5 px-3 py-1.5">
        <span className="shrink-0 text-xs font-medium text-[#2AB5BD]">{label}:</span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex-1 text-left text-xs text-gray-700 hover:text-gray-900"
        >
          {selectedDate ? dateFnsFormat(selectedDate, 'MMM d, yyyy') : <span className="text-gray-400">Pick a date…</span>}
        </button>
        {value && (
          <button type="button" onClick={() => { onChange(''); }} className="text-gray-300 hover:text-gray-500">
            <X className="h-3 w-3" />
          </button>
        )}
        <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-600">
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Dropdown calendar */}
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-xl border border-gray-200 bg-white p-3 shadow-lg">
          {/* Header: year‑prev | month‑prev | Month Year | month‑next | year‑next */}
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-0.5">
              <NavBtn onClick={() => setView((v) => { const d = new Date(v); d.setFullYear(d.getFullYear() - 1); return startOfMonth(d); })}>«</NavBtn>
              <NavBtn onClick={() => setView((v) => subMonths(v, 1))}>‹</NavBtn>
            </div>
            <span className="text-xs font-semibold text-gray-700">{dateFnsFormat(view, 'MMM yyyy')}</span>
            <div className="flex items-center gap-0.5">
              <NavBtn onClick={() => setView((v) => addMonths(v, 1))}>›</NavBtn>
              <NavBtn onClick={() => setView((v) => { const d = new Date(v); d.setFullYear(d.getFullYear() + 1); return startOfMonth(d); })}>»</NavBtn>
            </div>
          </div>

          {/* Day-of-week headers */}
          <div className="mb-1 grid grid-cols-7">
            {DAY_LABELS.map((d) => (
              <span key={d} className="text-center text-[10px] font-medium text-gray-400">{d}</span>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7">
            {days.map((d) => {
              const outside = !isSameMonth(d, view);
              const selected = selectedDate ? isSameDay(d, selectedDate) : false;
              const isToday = isSameDay(d, today);
              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  onClick={() => { onChange(dateFnsFormat(d, 'yyyy-MM-dd')); setOpen(false); }}
                  className={[
                    'flex h-7 w-full items-center justify-center rounded text-[11px] transition-colors',
                    outside ? 'text-gray-300' : 'text-gray-700',
                    selected ? 'bg-[#3CCED7] !text-white font-semibold' : '',
                    !selected && isToday ? 'font-semibold text-[#3CCED7]' : '',
                    !selected && !outside ? 'hover:bg-gray-100' : '',
                  ].join(' ')}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Autocomplete input for From / In channel filters ──────────────────────

interface AutocompleteInputProps {
  activeInput: FilterKey;
  inputDraft: string;
  chats: Chat[];
  filterInputRef: React.RefObject<HTMLInputElement>;
  onChangeDraft: (v: string) => void;
  onApply: (valueOverride?: string) => void;
  onSelectSuggestion: (value: string, chatId?: number) => void;
  onCancel: () => void;
  filterOptionLabel: (key: FilterKey) => string;
}

function FilterAutocompleteInput({
  activeInput, inputDraft, chats, filterInputRef,
  onChangeDraft, onApply, onSelectSuggestion, onCancel, filterOptionLabel,
}: AutocompleteInputProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const currentUser = useAuthStore((s) => s.user);
  const currentUsername = currentUser?.username ?? '';

  // Build suggestion list
  const suggestions: { label: string; sublabel?: string; value: string; chatId?: number }[] = (() => {
    const q = inputDraft.toLowerCase();
    if (activeInput === 'inChat') {
      return chats
        .filter((c) => c.type === 'group' && (c.name ?? '').toLowerCase().includes(q))
        .slice(0, 8)
        .map((c) => ({ label: `#${c.name ?? 'untitled'}`, value: c.name ?? '', chatId: c.id }));
    }
    if (activeInput === 'inConversation') {
      return chats
        .filter((c) => c.type === 'private')
        .map((c) => {
          const other = c.participants?.find((p) => p.user?.username !== currentUsername);
          const username = other?.user?.username ?? '';
          return { label: username, value: username, chatId: c.id };
        })
        .filter((s) => s.label && (!q || s.label.toLowerCase().includes(q)))
        .slice(0, 8);
    }
    if (activeInput === 'fromUser') {
      const seen = new Set<string>();
      const users: { label: string; sublabel?: string; value: string }[] = [];
      for (const chat of chats) {
        for (const p of chat.participants ?? []) {
          const u = p.user;
          if (!u?.username) continue;
          const key = u.username;
          if (seen.has(key)) continue;
          if (!q || u.username.toLowerCase().includes(q)) {
            seen.add(key);
            users.push({ label: u.username, sublabel: u.email ?? undefined, value: u.username });
          }
        }
      }
      return users.slice(0, 8);
    }
    return [];
  })();

  const showSuggestions = suggestions.length > 0 && (activeInput === 'fromUser' || activeInput === 'inChat' || activeInput === 'inConversation');

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) onCancel();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onCancel]);

  const isDate = activeInput === 'dateAfter' || activeInput === 'dateBefore';

  if (isDate) {
    return (
      <SearchDatePicker
        value={inputDraft}
        onChange={(v) => { onChangeDraft(v); onApply(v); }}
        onCancel={onCancel}
        label={filterOptionLabel(activeInput)}
      />
    );
  }

  return (
    <div ref={wrapperRef} className="relative mt-2">
      <div className="flex items-center gap-2 rounded-lg border border-[#3CCED7]/40 bg-[#3CCED7]/5 px-3 py-1.5">
        <span className="shrink-0 text-xs font-medium text-[#2AB5BD]">{filterOptionLabel(activeInput)}:</span>
        <input
          ref={filterInputRef}
          type="text"
          value={inputDraft}
          onChange={(e) => onChangeDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onApply();
            if (e.key === 'Escape') onCancel();
          }}
          placeholder={activeInput === 'inChat' ? 'channel name…' : (activeInput === 'fromUser' || activeInput === 'inConversation') ? 'username…' : ''}
          className="flex-1 bg-transparent text-xs text-gray-900 placeholder-gray-400 focus:outline-none"
          autoComplete="off"
        />
        <button type="button" onClick={() => onApply()} className="shrink-0 rounded bg-[#3CCED7] px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-[#2AB5BD]">Apply</button>
        <button type="button" onClick={onCancel} className="shrink-0 text-gray-400 hover:text-gray-600"><X className="h-3 w-3" /></button>
      </div>

      {showSuggestions && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
          {suggestions.map((s) => (
            <button
              key={s.chatId ?? s.value}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onSelectSuggestion(s.value, s.chatId); }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50"
            >
              {activeInput === 'inChat'
                ? <Hash className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                : activeInput === 'inConversation'
                  ? <MessageSquare className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                  : <User className="h-3.5 w-3.5 shrink-0 text-gray-400" />}
              <span className="flex-1 truncate text-sm text-gray-800">{s.label}</span>
              {s.sublabel && <span className="truncate text-xs text-gray-400">{s.sublabel}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── History entry helpers ──────────────────────────────────────────────────
function getHistoryLabel(entry: string): string {
  if (entry.startsWith('mentions_me:')) return `@${entry.slice(12)}`;
  if (entry.startsWith('in:#')) return `in:${entry.slice(4)}`; // strip '#', shown as icon
  return entry;
}

function getHistoryMeta(entry: string): { isFilter: boolean; icon: React.ReactNode } {
  if (entry.startsWith('from:'))       return { isFilter: true, icon: <User className="h-3 w-3" /> };
  if (entry.startsWith('in:#'))        return { isFilter: true, icon: <Hash className="h-3 w-3" /> };
  if (entry.startsWith('in:') && !entry.startsWith('in:#')) return { isFilter: true, icon: <MessageSquare className="h-3 w-3" /> };
  if (entry === 'has:file')            return { isFilter: true, icon: <Paperclip className="h-3 w-3" /> };
  if (entry === 'has:link')            return { isFilter: true, icon: <Link2 className="h-3 w-3" /> };
  if (entry === 'threads')             return { isFilter: true, icon: <MessageSquare className="h-3 w-3" /> };
  if (entry.startsWith('mentions_me:'))return { isFilter: true, icon: null };
  if (entry.startsWith('after:') || entry.startsWith('before:'))
                                       return { isFilter: true, icon: <Calendar className="h-3 w-3" /> };
  return { isFilter: false, icon: <Search className="h-3 w-3" /> };
}

export default function SearchPanel({ projectId, chats = [], onSelectResult, onClose, initialFilters, filterSignal }: Props) {
  const currentUser = useAuthStore((s) => s.user);
  const currentUsername = currentUser?.username ?? '';

  const inputRef = useRef<HTMLInputElement>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const plusBtnRef = useRef<HTMLButtonElement>(null);

  const [showDropdown, setShowDropdown] = useState(false);
  const [activeInput, setActiveInput] = useState<FilterKey | null>(null);
  const [inputDraft, setInputDraft] = useState('');

  const {
    query, setQuery,
    filters, setFilters,
    results,
    isLoading, error,
    hasMore, loadMore,
  } = useMessageSearch();

  const { history, addEntry, removeEntry, clearHistory } = useSearchHistory();

  const commitQuery = () => {
    if (query.trim().length >= 2) addEntry(query.trim());
  };

  // Apply initial filters on mount and whenever filterSignal increments
  useEffect(() => {
    if (initialFilters && Object.keys(initialFilters).length > 0) {
      setFilters((f) => ({ ...f, ...initialFilters }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSignal]);

  // Auto-focus on mount
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Infinite scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 100 && hasMore && !isLoading) loadMore();
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, [hasMore, isLoading, loadMore]);

  // Escape closes panel or dropdown
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showDropdown) { setShowDropdown(false); return; }
        if (activeInput) { setActiveInput(null); setInputDraft(''); return; }
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, showDropdown, activeInput]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showDropdown) return;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        plusBtnRef.current && !plusBtnRef.current.contains(e.target as Node)
      ) setShowDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showDropdown]);

  // Focus filter input when activeInput changes
  useEffect(() => {
    if (activeInput) setTimeout(() => filterInputRef.current?.focus(), 50);
  }, [activeInput]);

  // Parse a history entry and apply it as a filter or query
  const applyHistoryEntry = useCallback((entry: string) => {
    const base: SearchFilters = { fromUser: '', inChat: null, has: '', dateAfter: '', dateBefore: '', threadsOnly: false, mentionsMe: '' };
    if (entry.startsWith('from:')) {
      setFilters({ ...base, fromUser: entry.slice(5) });
    } else if (entry.startsWith('in:#')) {
      const name = entry.slice(4); // strip 'in:#'
      const chat = chats.find((c) => c.type === 'group' && c.name === name);
      if (chat) setFilters({ ...base, inChat: chat.id });
    } else if (entry.startsWith('in:') && !entry.startsWith('in:#')) {
      const username = entry.slice(3); // strip 'in:'
      const chat = chats.find(
        (c) => c.type === 'private' &&
               c.participants?.some((p) => p.user?.username === username)
      );
      if (chat) setFilters({ ...base, inChat: chat.id });
    } else if (entry === 'has:file') {
      setFilters({ ...base, has: 'file' });
    } else if (entry === 'has:link') {
      setFilters({ ...base, has: 'link' });
    } else if (entry === 'threads') {
      setFilters({ ...base, threadsOnly: true });
    } else if (entry.startsWith('mentions_me:')) {
      setFilters({ ...base, mentionsMe: entry.slice(12) });
    } else if (entry.startsWith('after:')) {
      setFilters({ ...base, dateAfter: entry.slice(6) });
    } else if (entry.startsWith('before:')) {
      setFilters({ ...base, dateBefore: entry.slice(7) });
    } else {
      setQuery(entry);
    }
  }, [chats, setFilters, setQuery]);

  const applyFilterDraft = useCallback((valueOverride?: string) => {
    if (!activeInput) return;
    const draft = (valueOverride ?? inputDraft).trim();
    if (activeInput === 'has') {
      setFilters({ ...filters, has: draft ? 'file' : '' });
      addEntry('has:file');
    } else if (activeInput === 'inChat') {
      const chat = chats.find(
        (c) => c.name?.toLowerCase() === draft.toLowerCase() ||
               String(c.id) === draft
      );
      if (chat) {
        setFilters({ ...filters, inChat: chat.id });
        addEntry(`in:#${chat.name ?? draft}`);
      }
    } else if (activeInput === 'inConversation' && draft) {
      const chat = chats.find(
        (c) => c.type === 'private' &&
               c.participants?.some((p) => p.user?.username?.toLowerCase() === draft.toLowerCase())
      );
      if (chat) {
        setFilters({ ...filters, inChat: chat.id });
        addEntry(`in:${draft}`);
      }
    } else if (activeInput === 'fromUser' && draft) {
      setFilters({ ...filters, fromUser: draft });
      addEntry(`from:${draft}`);
    } else if (activeInput === 'dateAfter' && draft) {
      setFilters({ ...filters, dateAfter: draft });
      addEntry(`after:${draft}`);
    } else if (activeInput === 'dateBefore' && draft) {
      setFilters({ ...filters, dateBefore: draft });
      addEntry(`before:${draft}`);
    } else {
      setFilters({ ...filters, [activeInput]: draft });
    }
    setActiveInput(null);
    setInputDraft('');
  }, [activeInput, inputDraft, filters, setFilters, chats, addEntry]);

  const selectFilterOption = (key: FilterKey) => {
    setShowDropdown(false);
    if (key === 'has') {
      const next = filters.has === 'file' ? '' : 'file';
      setFilters({ ...filters, has: next });
      if (next === 'file') addEntry('has:file');
      return;
    }
    setActiveInput(key);
    setInputDraft('');
  };

  // ── Derived state ──────────────────────────────────────────────────────
  const SEVEN_DAYS_AGO = (() => {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  })();
  const last7Active = filters.dateAfter === SEVEN_DAYS_AGO && !filters.dateBefore;
  const hasFileActive = filters.has === 'file';
  const hasLinkActive = filters.has === 'link';
  const threadsOnlyActive = filters.threadsOnly;
  const fromMeActive = !!(currentUsername && filters.fromUser === currentUsername);
  const includesMeActive = !!(currentUsername && filters.mentionsMe === currentUsername);

  const activeChips: { label: string; icon?: React.ReactNode; onRemove: () => void }[] = [];
  if (filters.fromUser && !fromMeActive) activeChips.push({ label: `from:${filters.fromUser}`, icon: <User className="h-3 w-3" />, onRemove: () => setFilters({ ...filters, fromUser: '' }) });
  if (filters.inChat) {
    const chat = chats.find((c) => c.id === filters.inChat);
    if (chat?.type === 'group') {
      activeChips.push({ label: `in:${chat.name}`, icon: <Hash className="h-3 w-3" />, onRemove: () => setFilters({ ...filters, inChat: null }) });
    } else {
      const otherUser = chat?.participants?.find((p) => p.user?.username !== currentUsername)?.user?.username ?? filters.inChat;
      activeChips.push({ label: `in:${otherUser}`, icon: <MessageSquare className="h-3 w-3" />, onRemove: () => setFilters({ ...filters, inChat: null }) });
    }
  }
  if (hasFileActive && !last7Active) activeChips.push({ label: 'has:file', icon: <Paperclip className="h-3 w-3" />, onRemove: () => setFilters({ ...filters, has: '' }) });
  if (hasLinkActive) activeChips.push({ label: 'has:link', icon: <Link2 className="h-3 w-3" />, onRemove: () => setFilters({ ...filters, has: '' }) });
  if (filters.dateAfter && !last7Active) activeChips.push({ label: `after:${filters.dateAfter}`, icon: <Calendar className="h-3 w-3" />, onRemove: () => setFilters({ ...filters, dateAfter: '' }) });
  if (filters.dateBefore) activeChips.push({ label: `before:${filters.dateBefore}`, icon: <Calendar className="h-3 w-3" />, onRemove: () => setFilters({ ...filters, dateBefore: '' }) });
  if (filters.mentionsMe && !includesMeActive) activeChips.push({ label: `mentions:${filters.mentionsMe}`, icon: <AtSign className="h-3 w-3" />, onRemove: () => setFilters({ ...filters, mentionsMe: '' }) });

  const hasAnyFilter = !!(filters.fromUser || filters.inChat || filters.has || filters.dateAfter || filters.dateBefore || filters.threadsOnly || filters.mentionsMe);

  const visibleResults = results.filter((r) => !deletedMessageIds.has(r.id));
  const showIdle = query.trim().length < 2 && !hasAnyFilter;
  const showEmpty = !isLoading && !showIdle && visibleResults.length === 0 && !error;

  const filterOptionLabel = (key: FilterKey) => FILTER_OPTIONS.find((o) => o.key === key)?.label ?? key;

  return (
    <div className="flex h-full flex-col bg-white">
      {/* ── Search input row ── */}
      <div className="flex shrink-0 items-center gap-2 border-b border-gray-100 px-4 py-3">
        <Search className="h-4 w-4 shrink-0 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commitQuery(); }}
          placeholder="Search messages…"
          className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
          aria-label="Search messages"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} className="rounded px-1.5 py-0.5 text-xs text-gray-400 hover:text-gray-600" aria-label="Clear search">
            Clear
          </button>
        )}
        <button type="button" onClick={onClose} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="Close search">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* ── Quick filter chips + "+" dropdown ── */}
      <div className="relative shrink-0 border-b border-gray-100 px-4 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {currentUsername && (
            <QuickChip
              label="From me"
              active={fromMeActive}
              onClick={() => {
                const next = fromMeActive ? '' : currentUsername;
                setFilters({ ...filters, fromUser: next });
                if (next) addEntry(`from:${next}`);
              }}
            />
          )}
          {currentUsername && (
            <QuickChip
              label="Mentions me"
              active={includesMeActive}
              onClick={() => {
                const next = includesMeActive ? '' : currentUsername;
                setFilters({ ...filters, mentionsMe: next });
                if (next) addEntry(`mentions_me:${next}`);
              }}
            />
          )}
          <QuickChip
            label="Has file"
            active={hasFileActive}
            onClick={() => {
              const next = hasFileActive ? '' : 'file';
              setFilters({ ...filters, has: next });
              if (next) addEntry('has:file');
            }}
          />
          <QuickChip
            label="Has a link"
            active={hasLinkActive}
            onClick={() => {
              const next = hasLinkActive ? '' : 'link';
              setFilters({ ...filters, has: next as 'link' | '' });
              if (next) addEntry('has:link');
            }}
          />
          <QuickChip
            label="Last 7 days"
            active={last7Active}
            onClick={() => setFilters({
              ...filters,
              dateAfter: last7Active ? '' : SEVEN_DAYS_AGO,
              dateBefore: last7Active ? filters.dateBefore : '',
            })}
          />
          <QuickChip
            label="Threads only"
            active={threadsOnlyActive}
            onClick={() => {
              const next = !threadsOnlyActive;
              setFilters({ ...filters, threadsOnly: next });
              if (next) addEntry('threads');
            }}
          />

          {/* More filters button */}
          <div className="relative">
            <button
              ref={plusBtnRef}
              type="button"
              onClick={() => setShowDropdown((v) => !v)}
              className={[
                'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                showDropdown
                  ? 'border-gray-300 bg-gray-100 text-gray-700'
                  : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50',
              ].join(' ')}
              aria-label="More filters"
            >
              <Plus className="h-3 w-3" />
              More
            </button>

            {showDropdown && (
              <div
                ref={dropdownRef}
                className="absolute left-0 top-full z-50 mt-1.5 w-52 rounded-xl border border-gray-200 bg-white py-1.5 shadow-lg"
              >
                {FILTER_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => selectFilterOption(opt.key)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <span className="text-gray-400">{opt.icon}</span>
                    <span className="flex-1">{opt.label}</span>
                    <span className="text-xs text-gray-400">{opt.shortcut}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {hasAnyFilter && (
            <button
              type="button"
              onClick={() => setFilters({ fromUser: '', inChat: null, has: '', dateAfter: '', dateBefore: '', threadsOnly: false, mentionsMe: '' })}
              className="ml-auto text-xs text-gray-400 hover:text-gray-600"
            >
              Clear all
            </button>
          )}
        </div>

        {/* Inline filter input with autocomplete */}
        {activeInput && activeInput !== 'has' && (
          <FilterAutocompleteInput
            activeInput={activeInput}
            inputDraft={inputDraft}
            chats={chats}
            filterInputRef={filterInputRef}
            onChangeDraft={setInputDraft}
            onApply={(v) => applyFilterDraft(v)}
            onSelectSuggestion={(value, chatId) => {
              if (activeInput === 'inChat' && chatId != null) {
                setFilters({ ...filters, inChat: chatId });
                const ch = chats.find((c) => c.id === chatId);
                addEntry(`in:#${ch?.name ?? value}`);
              } else if (activeInput === 'inConversation' && chatId != null) {
                setFilters({ ...filters, inChat: chatId });
                addEntry(`in:${value}`);
              } else if (activeInput === 'fromUser') {
                setFilters({ ...filters, fromUser: value });
                addEntry(`from:${value}`);
              } else if (activeInput) {
                setFilters({ ...filters, [activeInput]: value });
              }
              setActiveInput(null);
              setInputDraft('');
            }}
            onCancel={() => { setActiveInput(null); setInputDraft(''); }}
            filterOptionLabel={filterOptionLabel}
          />
        )}
      </div>

      {/* ── Active filter chips ── */}
      {activeChips.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-gray-100 px-4 py-2">
          {activeChips.map((chip) => (
            <FilterChip key={chip.label} label={chip.label} icon={chip.icon} onRemove={chip.onRemove} />
          ))}
        </div>
      )}

      {/* ── Results / idle ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {showIdle && (
          <div className="px-4 py-4">
            {history.length > 0 ? (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Recent searches</span>
                  <button type="button" onClick={clearHistory} className="text-[11px] text-gray-400 hover:text-gray-600">Clear all</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {history.map((q) => {
                    const { isFilter, icon } = getHistoryMeta(q);
                    return (
                      <span
                        key={q}
                        className={[
                          'group inline-flex items-center gap-1.5 rounded-full py-1 pl-2 pr-1.5 text-xs transition',
                          isFilter
                            ? 'border border-[#3CCED7]/40 bg-[#3CCED7]/10 text-[#2AB5BD] shadow-sm hover:border-[#3CCED7]/60 hover:bg-[#3CCED7]/20'
                            : 'border border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300 hover:bg-gray-100',
                        ].join(' ')}
                      >
                        {icon && <span className={isFilter ? 'text-[#3CCED7]' : 'text-gray-400'}>{icon}</span>}
                        <button type="button" className="max-w-[150px] truncate font-medium" onClick={() => applyHistoryEntry(q)}>{getHistoryLabel(q)}</button>
                        <button type="button" onClick={() => removeEntry(q)} className={['shrink-0 rounded-full p-0.5 transition', isFilter ? 'text-[#3CCED7]/50 hover:text-[#2AB5BD]' : 'text-gray-300 hover:text-gray-500'].join(' ')} aria-label={`Remove "${q}"`}>
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2 py-12 text-center text-gray-400">
                <Search className="h-10 w-10 opacity-20" />
                <p className="text-sm">Search your messages</p>
                <p className="text-xs text-gray-300">Type at least 2 characters to search</p>
              </div>
            )}
          </div>
        )}

        {!showIdle && isLoading && results.length === 0 && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-gray-300" />
          </div>
        )}

        {error && <div className="px-4 py-8 text-center text-sm text-red-500">{error}</div>}

        {showEmpty && (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center text-gray-400">
            <Search className="h-8 w-8 opacity-20" />
            <p className="text-sm">No messages found{query ? ` for "${query}"` : ''}</p>
            <p className="text-xs text-gray-300">Try different keywords or remove filters</p>
          </div>
        )}

        {visibleResults.length > 0 && (
          <div className="px-2 py-2">
            <p className="px-2 pb-1 text-[11px] text-gray-400">
              {visibleResults.length === 1 ? '1 result' : `${visibleResults.length} results`}
            </p>
            {visibleResults.map((r) => (
              <SearchResultItem key={r.id} result={r} onClick={() => { commitQuery(); onSelectResult(r); }} />
            ))}
            {hasMore && results.length > 0 && (
              <div className="py-4 text-center">
                {isLoading
                  ? <Loader2 className="mx-auto h-4 w-4 animate-spin text-gray-300" />
                  : <button type="button" onClick={loadMore} className="text-xs text-[#3CCED7] hover:underline">Load more results</button>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
