'use client';

import { useState } from 'react';
import { Filter, X } from 'lucide-react';
import type { AuditEventType, AuditLogFilters } from '@/types/audit';
import { AUDIT_EVENT_CATEGORIES, AUDIT_EVENT_METADATA, getEventTypesForCategory } from '@/types/audit';

interface AuditLogFilterBarProps {
  filters: AuditLogFilters;
  onChange: (filters: AuditLogFilters) => void;
  actors?: { id: number; display_name: string }[];
}

const CATEGORY_KEYS = Object.keys(AUDIT_EVENT_CATEGORIES);

export default function AuditLogFilterBar({ filters, onChange, actors = [] }: AuditLogFilterBarProps) {
  const [isOpen, setIsOpen] = useState(false);

  const selectedTypes = filters.event_type ?? [];

  function toggleEventType(eventType: AuditEventType) {
    const next = selectedTypes.includes(eventType)
      ? selectedTypes.filter((t) => t !== eventType)
      : [...selectedTypes, eventType];
    onChange({ ...filters, event_type: next.length > 0 ? next : undefined });
  }

  function toggleCategory(category: string) {
    const categoryTypes = getEventTypesForCategory(category);
    const allSelected = categoryTypes.every((t) => selectedTypes.includes(t));
    let next: AuditEventType[];
    if (allSelected) {
      next = selectedTypes.filter((t) => !categoryTypes.includes(t));
    } else {
      next = [...new Set([...selectedTypes, ...categoryTypes])];
    }
    onChange({ ...filters, event_type: next.length > 0 ? next : undefined });
  }

  function isCategoryChecked(category: string) {
    return getEventTypesForCategory(category).every((t) => selectedTypes.includes(t));
  }

  function isCategoryIndeterminate(category: string) {
    const types = getEventTypesForCategory(category);
    const checked = types.filter((t) => selectedTypes.includes(t));
    return checked.length > 0 && checked.length < types.length;
  }

  function clearAll() {
    onChange({ event_type: undefined, actor_id: undefined, from: undefined, to: undefined });
  }

  const activeFilterCount =
    (selectedTypes.length > 0 ? 1 : 0) +
    (filters.actor_id ? 1 : 0) +
    (filters.from || filters.to ? 1 : 0);

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setIsOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          <Filter size={14} />
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#3CCED7] text-white text-[10px] font-bold">
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* Actor chip */}
        {filters.actor_id && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
            {actors.find((a) => a.id === filters.actor_id)?.display_name ?? `User #${filters.actor_id}`}
            <button onClick={() => onChange({ ...filters, actor_id: undefined })} aria-label="Remove actor filter">
              <X size={10} />
            </button>
          </span>
        )}

        {/* Date range chip */}
        {(filters.from || filters.to) && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300">
            Date range
            <button onClick={() => onChange({ ...filters, from: undefined, to: undefined })} aria-label="Remove date filter">
              <X size={10} />
            </button>
          </span>
        )}

        {/* Event type chips (show up to 3) */}
        {selectedTypes.slice(0, 3).map((t) => (
          <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-[#3CCED7]/10 text-[#1a9ba3]">
            {AUDIT_EVENT_METADATA[t].label}
            <button onClick={() => toggleEventType(t)} aria-label={`Remove ${t} filter`}>
              <X size={10} />
            </button>
          </span>
        ))}
        {selectedTypes.length > 3 && (
          <span className="text-xs text-gray-500 dark:text-gray-400">+{selectedTypes.length - 3} more</span>
        )}

        {activeFilterCount > 0 && (
          <button onClick={clearAll} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline">
            Clear all
          </button>
        )}
      </div>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 top-full mt-2 z-20 w-80 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4 space-y-4">
            {/* Event types grouped by category */}
            <div>
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Event Types</div>
              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {CATEGORY_KEYS.map((categoryKey) => {
                  const category = AUDIT_EVENT_CATEGORIES[categoryKey];
                  const types = getEventTypesForCategory(categoryKey);
                  return (
                    <div key={categoryKey}>
                      <label className="flex items-center gap-2 cursor-pointer mb-1">
                        <input
                          type="checkbox"
                          checked={isCategoryChecked(categoryKey)}
                          ref={(el) => {
                            if (el) el.indeterminate = isCategoryIndeterminate(categoryKey);
                          }}
                          onChange={() => toggleCategory(categoryKey)}
                          className="rounded border-gray-300 dark:border-gray-600 accent-[#3CCED7]"
                        />
                        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{category.label}</span>
                      </label>
                      <div className="ml-5 space-y-1">
                        {types.map((eventType) => (
                          <label key={eventType} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedTypes.includes(eventType)}
                              onChange={() => toggleEventType(eventType)}
                              className="rounded border-gray-300 dark:border-gray-600 accent-[#3CCED7]"
                            />
                            <span className="text-xs text-gray-600 dark:text-gray-400">
                              {AUDIT_EVENT_METADATA[eventType].label}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Actor */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                Actor
              </label>
              {actors.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-500 italic">No actors in log yet</p>
              ) : (
                <select
                  value={filters.actor_id ?? ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    onChange({ ...filters, actor_id: val ? parseInt(val, 10) : undefined });
                  }}
                  className="w-full px-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#3CCED7]"
                >
                  <option value="">All actors</option>
                  {actors.map((a) => (
                    <option key={a.id} value={a.id}>{a.display_name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Date range */}
            <div>
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Date Range</div>
              <div className="space-y-2">
                <div>
                  <label htmlFor="audit-filter-from" className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">From</label>
                  <input
                    id="audit-filter-from"
                    type="date"
                    value={filters.from ? filters.from.slice(0, 10) : ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      onChange({ ...filters, from: val ? `${val}T00:00:00Z` : undefined });
                    }}
                    className="w-full px-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#3CCED7]"
                  />
                </div>
                <div>
                  <label htmlFor="audit-filter-to" className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">To</label>
                  <input
                    id="audit-filter-to"
                    type="date"
                    value={filters.to ? filters.to.slice(0, 10) : ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      onChange({ ...filters, to: val ? `${val}T23:59:59Z` : undefined });
                    }}
                    className="w-full px-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#3CCED7]"
                  />
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
