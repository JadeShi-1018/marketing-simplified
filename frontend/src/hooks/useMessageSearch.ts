'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { searchMessages } from '@/lib/api/chatApi';
import type { MessageSearchResult, SearchMessagesParams } from '@/types/chat';

export interface SearchFilters {
  fromUser: string;
  inChat: number | null;
  has: 'file' | 'link' | '';
  dateAfter: string;
  dateBefore: string;
  threadsOnly: boolean;
  mentionsMe: string; // current user's username, empty = off
}

const DEFAULT_FILTERS: SearchFilters = {
  fromUser: '',
  inChat: null,
  has: '',
  dateAfter: '',
  dateBefore: '',
  threadsOnly: false,
  mentionsMe: '',
};

const DEBOUNCE_MS = 300;
const PAGE_SIZE = 20;

export function useMessageSearch() {
  const [query, setQueryRaw] = useState('');
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  const [results, setResults] = useState<MessageSearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string, f: SearchFilters, off: number) => {
    const hasFilters = !!(f.fromUser || f.inChat || f.has || f.dateAfter || f.dateBefore || f.threadsOnly || f.mentionsMe);

    if (q.trim().length < 2 && !hasFilters) {
      setResults([]);
      setTotal(0);
      setIsLoading(false);
      return;
    }

    // Cancel in-flight request
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const params: SearchMessagesParams = {
      q: q.trim(),
      limit: PAGE_SIZE,
      offset: off,
    };
    if (f.fromUser) params.from_user = f.fromUser;
    if (f.inChat) params.in_chat = f.inChat;
    if (f.has) params.has = f.has;
    if (f.dateAfter) params.date_after = f.dateAfter;
    if (f.dateBefore) params.date_before = f.dateBefore;
    if (f.threadsOnly) params.threads_only = true;
    if (f.mentionsMe) params.mentions_me = f.mentionsMe;

    setIsLoading(true);
    setError(null);

    try {
      const data = await searchMessages(params);
      if (off === 0) {
        setResults(data.results);
      } else {
        setResults((prev) => [...prev, ...data.results]);
      }
      setTotal(data.total);
    } catch (err: any) {
      if (err?.name === 'CanceledError' || err?.name === 'AbortError') return;
      setError('Search failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Debounced search on query/filter change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setOffset(0);
      doSearch(query, filters, 0);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, filters, doSearch]);

  const setQuery = useCallback((q: string) => {
    setQueryRaw(q);
  }, []);

  const loadMore = useCallback(() => {
    if (isLoading || results.length >= total) return;
    const nextOffset = offset + PAGE_SIZE;
    setOffset(nextOffset);
    doSearch(query, filters, nextOffset);
  }, [isLoading, results.length, total, offset, query, filters, doSearch]);

  const reset = useCallback(() => {
    setQueryRaw('');
    setFilters(DEFAULT_FILTERS);
    setResults([]);
    setTotal(0);
    setOffset(0);
    setError(null);
  }, []);

  return {
    query,
    setQuery,
    filters,
    setFilters,
    results,
    total,
    isLoading,
    error,
    hasMore: results.length < total,
    loadMore,
    reset,
  };
}
