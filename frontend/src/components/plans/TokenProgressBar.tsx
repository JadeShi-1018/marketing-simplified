'use client';

import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';
import { formatTokens } from '@/lib/format';

interface QuotaPreview {
  project_name: string;
  tokens_used: number;
  tokens_reserved: number;
  overage_tokens: number;
  monthly_token_quota: number | null;
  overage_price_cents_per_1m: number | null;
  year_month: string;
}

interface TokenProgressBarProps {
  // Project routes now carry the slug, so projectId may be a slug
  // string; the quota-preview endpoint resolves slug-or-id server-side.
  projectId: number | string;
}

export default function TokenProgressBar({ projectId }: TokenProgressBarProps) {
  const [data, setData] = useState<QuotaPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(() => {
    api
      .get<QuotaPreview>('/api/stripe/quota-preview/', { params: { project_id: projectId } })
      .then((res) => setData(res.data))
      .catch(() => setError('Failed to load usage'));
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    window.addEventListener('quota:refresh', fetchData);
    return () => window.removeEventListener('quota:refresh', fetchData);
  }, [fetchData]);

  if (error) {
    return <p className="text-xs text-red-500">{error}</p>;
  }

  if (!data) {
    return <div className="h-6 w-full animate-pulse rounded bg-gray-100" />;
  }

  const { project_name, tokens_used, overage_tokens, monthly_token_quota, overage_price_cents_per_1m } = data;

  const isUnlimited = monthly_token_quota === null;
  const pct = isUnlimited ? 100 : Math.min((tokens_used / monthly_token_quota!) * 100, 100);

  const barColor =
    !isUnlimited && tokens_used > monthly_token_quota!
      ? 'bg-red-500'
      : pct > 80
      ? 'bg-amber-500'
      : 'bg-[#3CCED7]';

  const hasOverage = overage_tokens > 0;
  const overageCostCents =
    hasOverage && overage_price_cents_per_1m !== null
      ? Math.floor(overage_tokens / 1_000_000) * overage_price_cents_per_1m
      : null;

  return (
    <div className="space-y-1 text-sm">
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span className="font-medium text-gray-700">Project: {project_name}</span>
        <span>
          {isUnlimited ? (
            <span className="text-[#3CCED7]">Unlimited</span>
          ) : (
            <>
              {formatTokens(tokens_used)} / {formatTokens(monthly_token_quota)}
            </>
          )}
        </span>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${isUnlimited ? 100 : Math.min(pct, 100)}%` }}
        />
      </div>

      {hasOverage && (
        <p className="text-xs text-amber-600">
          Overage: {formatTokens(overage_tokens)}
          {overageCostCents !== null && (
            <span> ≈ ${(overageCostCents / 100).toFixed(2)}</span>
          )}
        </p>
      )}
    </div>
  );
}
