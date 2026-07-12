'use client';

import { BarChart2, BrainCircuit, Calendar, MessageSquare, Columns2, ScanSearch, Cpu } from 'lucide-react';
import type { OrgUsageBreakdownItem } from '@/lib/api/organizationApi';

interface OrgUsageBreakdownCardProps {
  breakdown: OrgUsageBreakdownItem[];
  totalTokens: number;
}

// Icon per purpose
const PURPOSE_ICON: Record<string, React.ElementType> = {
  data_analysis:       BrainCircuit,
  column_detection:    ScanSearch,
  criteria_generation: Columns2,
  miro_generation:     BarChart2,
  follow_up_chat:      MessageSquare,
  calendar_suggestion: Calendar,
  other:               Cpu,
};

// Colour accent per purpose (bg, bar, text)
const PURPOSE_COLOR: Record<string, { icon: string; bar: string }> = {
  data_analysis:       { icon: 'text-[#3CCED7]',    bar: 'bg-[#3CCED7]' },
  column_detection:    { icon: 'text-violet-500',    bar: 'bg-violet-400' },
  criteria_generation: { icon: 'text-amber-500',     bar: 'bg-amber-400'  },
  miro_generation:     { icon: 'text-blue-500',      bar: 'bg-blue-400'   },
  follow_up_chat:      { icon: 'text-emerald-500',   bar: 'bg-emerald-400'},
  calendar_suggestion: { icon: 'text-pink-500',      bar: 'bg-pink-400'   },
  other:               { icon: 'text-gray-400',      bar: 'bg-gray-300'   },
};

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function OrgUsageBreakdownCard({
  breakdown,
  totalTokens,
}: OrgUsageBreakdownCardProps) {
  const hasData = breakdown.length > 0 && totalTokens > 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <BarChart2 className="w-4 h-4 text-[#3CCED7]" />
        <h3 className="text-sm font-semibold text-gray-800">Usage Breakdown</h3>
        <span className="ml-auto text-xs text-gray-400">This month · by feature</span>
      </div>

      {!hasData ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <BarChart2 className="w-8 h-8 text-gray-200 mb-2" />
          <p className="text-sm text-gray-400">No AI usage recorded yet this month.</p>
          <p className="text-xs text-gray-300 mt-1">
            Usage will appear here once you run data analysis or other AI features.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {breakdown.map((item) => {
            const pct = totalTokens > 0
              ? Math.max(2, Math.round((item.normalized_tokens / totalTokens) * 100))
              : 0;
            const Icon = PURPOSE_ICON[item.purpose] ?? Cpu;
            const color = PURPOSE_COLOR[item.purpose] ?? PURPOSE_COLOR.other;

            return (
              <li key={item.purpose}>
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${color.icon}`} />
                  <span className="text-xs font-medium text-gray-700 flex-1 truncate">
                    {item.label}
                  </span>
                  <span className="text-xs text-gray-500 tabular-nums">
                    {formatTokens(item.normalized_tokens)}
                  </span>
                  <span className="text-xs text-gray-400 w-9 text-right tabular-nums">
                    {pct}%
                  </span>
                </div>
                {/* Progress bar */}
                <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${color.bar} transition-all duration-500`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
