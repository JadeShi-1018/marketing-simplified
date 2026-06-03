'use client';

import { useState, useCallback } from 'react';

const STORAGE_KEY = 'msg-search-history';
const MAX_ENTRIES = 10;

function readHistory(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored: string[] = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    const trimmed = stored.slice(0, MAX_ENTRIES);
    // Persist the trimmed list so it doesn't grow back
    if (trimmed.length < stored.length) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed)); } catch {}
    }
    return trimmed;
  } catch {
    return [];
  }
}

function writeHistory(entries: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {}
}

export function useSearchHistory() {
  const [history, setHistory] = useState<string[]>(readHistory);

  const addEntry = useCallback((query: string) => {
    const q = query.trim();
    if (!q) return;
    setHistory((prev) => {
      const deduped = [q, ...prev.filter((h) => h !== q)].slice(0, MAX_ENTRIES);
      writeHistory(deduped);
      return deduped;
    });
  }, []);

  const removeEntry = useCallback((query: string) => {
    setHistory((prev) => {
      const next = prev.filter((h) => h !== query);
      writeHistory(next);
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    writeHistory([]);
    setHistory([]);
  }, []);

  return { history, addEntry, removeEntry, clearHistory };
}
