'use client';

import { useRef, useEffect, useState } from 'react';
import { Search, X, Loader2, SlidersHorizontal, Paperclip, User, Calendar } from 'lucide-react';
import { useMessageSearch } from '@/hooks/useMessageSearch';
import { useSearchHistory } from '@/hooks/useSearchHistory';
import { deletedMessageIds } from '@/lib/chatStore';
import type { MessageSearchResult, Chat } from '@/types/chat';
import SearchResultItem from './SearchResultItem';
import SearchFilterBar from './SearchFilterBar';

interface Props {
  projectId: number | null;
  chats?: Chat[];
  onSelectResult: (result: MessageSearchResult) => void;
  onClose: () => void;
}

export default function SearchPanel({ projectId, chats = [], onSelectResult, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showFilterInputs, setShowFilterInputs] = useState(false);

  const {
    query, setQuery,
    filters, setFilters,
    results, total,
    isLoading, error,
    hasMore, loadMore,
  } = useMessageSearch();

  const { history, addEntry, removeEntry, clearHistory } = useSearchHistory();

  // Save to history only on explicit submission (Enter key or clicking a result)
  const commitQuery = () => {
    if (query.trim().length >= 2) addEntry(query.trim());
  };

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Infinite scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 100 && hasMore && !isLoading) {
        loadMore();
      }
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, [hasMore, isLoading, loadMore]);

  // Keyboard: Escape closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Filter out messages the user deleted in this session
  const visibleResults = results.filter((r) => !deletedMessageIds.has(r.id));

  const showIdle = query.trim().length < 2;
  const showEmpty = !isLoading && !showIdle && visibleResults.length === 0 && !error;

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-gray-200 px-4 py-3">
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
          <button
            type="button"
            onClick={() => setQuery('')}
            className="rounded p-1 text-gray-400 hover:text-gray-600"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowFilterInputs(!showFilterInputs)}
          className={`rounded p-1.5 transition ${showFilterInputs ? 'bg-[#3CCED7]/10 text-[#2AB5BD]' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'}`}
          aria-label="Toggle filters"
          title="Filters"
        >
          <SlidersHorizontal className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label="Close search"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Filter inputs (expanded) */}
      {showFilterInputs && (
        <div className="shrink-0 border-b border-gray-100 bg-gray-50 px-4 py-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">
                <User className="h-3 w-3" /> From
              </span>
              <input
                type="text"
                value={filters.fromUser}
                onChange={(e) => setFilters({ ...filters, fromUser: e.target.value })}
                placeholder="username or email"
                className="rounded-md border border-gray-200 px-2 py-1 text-xs focus:border-[#3CCED7] focus:outline-none focus:ring-1 focus:ring-[#3CCED7]/30"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">
                <Paperclip className="h-3 w-3" /> Has
              </span>
              <select
                value={filters.has}
                onChange={(e) => setFilters({ ...filters, has: e.target.value as 'file' | '' })}
                className="rounded-md border border-gray-200 px-2 py-1 text-xs focus:border-[#3CCED7] focus:outline-none"
              >
                <option value="">Any</option>
                <option value="file">File attachment</option>
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">
                <Calendar className="h-3 w-3" /> After
              </span>
              <input
                type="date"
                value={filters.dateAfter}
                onChange={(e) => setFilters({ ...filters, dateAfter: e.target.value })}
                className="rounded-md border border-gray-200 px-2 py-1 text-xs focus:border-[#3CCED7] focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">
                <Calendar className="h-3 w-3" /> Before
              </span>
              <input
                type="date"
                value={filters.dateBefore}
                onChange={(e) => setFilters({ ...filters, dateBefore: e.target.value })}
                className="rounded-md border border-gray-200 px-2 py-1 text-xs focus:border-[#3CCED7] focus:outline-none"
              />
            </label>
          </div>
        </div>
      )}

      {/* Active filter chips */}
      <SearchFilterBar filters={filters} onChangeFilters={setFilters} chats={chats} />

      {/* Results / idle */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">

        {/* Idle state — show history or empty prompt */}
        {showIdle && (
          <div className="px-4 py-4">
            {history.length > 0 ? (
              <>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                    Recent searches
                  </span>
                  <button
                    type="button"
                    onClick={clearHistory}
                    className="text-[11px] text-gray-400 hover:text-gray-600"
                  >
                    Clear all
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {history.map((q) => (
                    <span key={q} className="group inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 pl-2.5 pr-1.5 py-1 text-xs text-gray-600 hover:border-gray-300 hover:bg-gray-100 transition">
                      <button
                        type="button"
                        className="max-w-[160px] truncate"
                        onClick={() => setQuery(q)}
                      >
                        {q}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeEntry(q)}
                        className="shrink-0 rounded-full p-0.5 text-gray-300 hover:text-gray-500 transition"
                        aria-label={`Remove "${q}" from history`}
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2 py-12 text-center text-gray-400">
                <Search className="h-10 w-10 opacity-20" />
                <p className="text-sm">Type at least 2 characters to search</p>
                <p className="text-xs text-gray-300">Search across all your messages, files, and conversations</p>
              </div>
            )}
          </div>
        )}

        {/* Loading */}
        {!showIdle && isLoading && results.length === 0 && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-gray-300" />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="px-4 py-8 text-center text-sm text-red-500">{error}</div>
        )}

        {/* Empty */}
        {showEmpty && (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center text-gray-400">
            <Search className="h-8 w-8 opacity-20" />
            <p className="text-sm">No messages found for "{query}"</p>
            <p className="text-xs text-gray-300">Try different keywords or remove filters</p>
          </div>
        )}

        {/* Results list */}
        {visibleResults.length > 0 && (
          <div className="px-2 py-2">
            <p className="px-2 pb-1 text-[11px] text-gray-400">
              {visibleResults.length === 1 ? '1 result' : `${visibleResults.length} results`}
            </p>

            {visibleResults.map((r) => (
              <SearchResultItem
                key={r.id}
                result={r}
                onClick={() => { commitQuery(); onSelectResult(r); }}
              />
            ))}

            {/* Load more */}
            {hasMore && results.length > 0 && (
              <div className="py-4 text-center">
                {isLoading ? (
                  <Loader2 className="mx-auto h-4 w-4 animate-spin text-gray-300" />
                ) : (
                  <button
                    type="button"
                    onClick={loadMore}
                    className="text-xs text-[#3CCED7] hover:underline"
                  >
                    Load more results
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
