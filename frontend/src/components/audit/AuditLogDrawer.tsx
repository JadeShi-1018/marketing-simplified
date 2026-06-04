'use client';

import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { AuditLogEntry, AuditLogFilters } from '@/types/audit';
import { fetchAuditLog } from '@/lib/api/auditLogApi';
import AuditLogFilterBar from './AuditLogFilterBar';
import AuditLogTimeline from './AuditLogTimeline';

interface AuditLogDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: number;
  meetingId: number;
}

export default function AuditLogDrawer({ isOpen, onClose, projectId, meetingId }: AuditLogDrawerProps) {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [filters, setFilters] = useState<AuditLogFilters>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(
    async (pageNum: number, currentFilters: AuditLogFilters, append: boolean) => {
      try {
        const response = await fetchAuditLog(projectId, meetingId, currentFilters, pageNum);
        setEntries((prev) => (append ? [...prev, ...response.results] : response.results));
        setHasMore(response.next !== null);
        setPage(pageNum);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load audit log');
      }
    },
    [projectId, meetingId]
  );

  useEffect(() => {
    if (!isOpen) return;
    setIsLoading(true);
    setEntries([]);
    setPage(1);
    setHasMore(false);
    loadPage(1, filters, false).finally(() => setIsLoading(false));
  }, [isOpen, filters, loadPage]);

  async function handleLoadMore() {
    setIsLoadingMore(true);
    await loadPage(page + 1, filters, true);
    setIsLoadingMore(false);
  }

  function handleFiltersChange(next: AuditLogFilters) {
    setFilters(next);
  }

  // Trap focus / close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Audit Log">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/40 transition-opacity"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div className="absolute right-0 top-0 h-full w-full max-w-xl bg-white dark:bg-gray-900 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Audit Log</h2>
          <button
            onClick={onClose}
            aria-label="Close audit log"
            className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X size={18} />
          </button>
        </div>

        {/* Filters */}
        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700">
          <AuditLogFilterBar
            filters={filters}
            onChange={handleFiltersChange}
            actors={Array.from(
              new Map(
                entries
                  .filter((e) => e.actor !== null)
                  .map((e) => [e.actor!.id, { id: e.actor!.id, display_name: e.actor!.display_name }])
              ).values()
            )}
          />
        </div>

        {/* Timeline */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error ? (
            <div className="flex flex-col items-center justify-center py-16 text-red-500 dark:text-red-400">
              <p className="text-sm">{error}</p>
              <button
                onClick={() => {
                  setIsLoading(true);
                  loadPage(1, filters, false).finally(() => setIsLoading(false));
                }}
                className="mt-3 text-sm underline"
              >
                Retry
              </button>
            </div>
          ) : (
            <AuditLogTimeline
              entries={entries}
              isLoading={isLoading}
              hasMore={hasMore}
              onLoadMore={handleLoadMore}
              isLoadingMore={isLoadingMore}
            />
          )}
        </div>
      </div>
    </div>
  );
}
