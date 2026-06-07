'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { formatTokens } from '@/lib/format';

interface QuotaPreview {
  project_name: string;
  tokens_used: number;
  monthly_token_quota: number | null;
}

interface TokenBadgeProps {
  projectId: number;
}

export default function TokenBadge({ projectId }: TokenBadgeProps) {
  const [data, setData] = useState<QuotaPreview | null>(null);

  useEffect(() => {
    api
      .get<QuotaPreview>('/api/stripe/quota-preview/', { params: { project_id: projectId } })
      .then((res) => setData(res.data))
      .catch(() => {});
  }, [projectId]);

  if (!data) return null;

  const { project_name, tokens_used, monthly_token_quota } = data;
  const isUnlimited = monthly_token_quota === null;
  const pct = isUnlimited ? 0 : (tokens_used / monthly_token_quota!) * 100;

  const dotColor =
    isUnlimited
      ? 'bg-green-500'
      : pct > 100
      ? 'bg-red-500'
      : pct > 80
      ? 'bg-orange-400'
      : 'bg-green-500';

  return (
    <div className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-700">
      <span className={`h-2 w-2 rounded-full ${dotColor}`} />
      <span className="font-medium">{project_name}</span>
      <span className="text-gray-400">·</span>
      <span>
        {isUnlimited ? 'Unlimited' : `${formatTokens(tokens_used)} / ${formatTokens(monthly_token_quota)}`}
      </span>
    </div>
  );
}
