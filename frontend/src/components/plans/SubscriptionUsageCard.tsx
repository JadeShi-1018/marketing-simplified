'use client';

import { useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import type { OrgTokenSummary } from '@/hooks/usePlan';
import { formatTokens } from '@/lib/format';

export default function SubscriptionUsageCard({ fetchSummary }: { fetchSummary: () => Promise<OrgTokenSummary> }) {
  const [summary, setSummary] = useState<OrgTokenSummary | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchSummary().then(setSummary).catch(() => setError(true));
  }, [fetchSummary]);

  if (error) return <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">Unable to load usage.</div>;
  if (!summary) return <Skeleton className="h-64 w-full rounded-xl" />;

  const quota = summary.monthly_token_quota;
  const percent = quota ? Math.min(100, Math.round((summary.tokens_used / quota) * 100)) : 0;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-semibold text-gray-900"><BarChart3 className="h-5 w-5 text-[#3CCED7]" />Usage this month</div>
      <div className="mt-6 flex items-end justify-between gap-3">
        <div><span className="text-3xl font-semibold text-gray-950">{formatTokens(summary.tokens_used)}</span><span className="ml-2 text-sm text-gray-500">of {formatTokens(quota)} tokens</span></div>
        <span className="text-sm font-semibold text-gray-700">{percent}%</span>
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-gradient-to-r from-[#3CCED7] to-[#A6E661]" style={{ width: `${percent}%` }} /></div>
      <dl className="mt-6 space-y-3 border-t border-gray-100 pt-5 text-sm">
        <div className="flex justify-between"><dt className="text-gray-500">Included tokens</dt><dd className="font-medium text-gray-800">{formatTokens(quota)}</dd></div>
        <div className="flex justify-between"><dt className="text-gray-500">Used</dt><dd className="font-medium text-gray-800">{formatTokens(summary.tokens_used)}</dd></div>
        <div className="flex justify-between"><dt className="text-gray-500">Overage</dt><dd className="font-medium text-gray-800">{summary.overage_price_cents_per_1m ? `$${(summary.overage_price_cents_per_1m / 100).toFixed(0)} ${summary.currency} / 1M tokens` : 'Hard block'}</dd></div>
      </dl>
    </section>
  );
}
