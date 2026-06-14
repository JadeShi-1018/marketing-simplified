import type { Plan } from '@/hooks/usePlan';
import { formatTokens } from '@/lib/format';

// TODO(PM): confirm any real per-module Free/Team gating.

export type ComparisonValue = boolean | string;

export interface ComparisonRow {
  label: string;
  free: ComparisonValue;
  team: ComparisonValue;
}

export interface ComparisonGroup {
  name: string;
  rows: ComparisonRow[];
}

export const publicPricingPlans: Plan[] = [
  {
    id: 0,
    name: 'Free',
    desc: 'Perfect for trying out the full workspace.',
    stripe_price_id: null,
    base_price_cents: 0,
    monthly_token_quota: 500_000,
    included_seats: 1,
    extra_seat_price_cents: null,
    overage_price_cents_per_1m: null,
    currency: 'AUD',
    is_archived: false,
  },
  {
    id: 1,
    name: 'Team',
    desc: 'Built for growing advertising teams.',
    stripe_price_id: null,
    base_price_cents: 4_900,
    monthly_token_quota: 5_000_000,
    included_seats: 5,
    extra_seat_price_cents: 900,
    overage_price_cents_per_1m: 500,
    currency: 'AUD',
    is_archived: false,
  },
];

export function buildComparisonData(plans: Plan[]): ComparisonGroup[] {
  const free = plans.find((plan) => plan.base_price_cents === 0) ?? publicPricingPlans[0];
  const team = plans.find((plan) => plan.base_price_cents > 0) ?? publicPricingPlans[1];
  const moduleRows = (labels: string[]): ComparisonRow[] =>
    labels.map((label) => ({ label, free: true, team: true }));

  return [
    {
      name: 'Core workspace',
      rows: moduleRows(['Campaigns', 'Tasks', 'Decisions', 'Meetings', 'Calendar', 'Docs', 'Messages']),
    },
    {
      name: 'AI & Analytics',
      rows: moduleRows(['AI Agent workflows', 'Spreadsheet analysis', 'Calendar Q&A']),
    },
    {
      name: 'Usage & limits',
      rows: [
        { label: 'Monthly tokens', free: formatTokens(free.monthly_token_quota), team: formatTokens(team.monthly_token_quota) },
        { label: 'Max tokens per call', free: formatTokens(free.max_tokens_per_call ?? 50_000), team: formatTokens(team.max_tokens_per_call ?? 50_000) },
        { label: 'Over-quota', free: 'Hard block', team: `$${((team.overage_price_cents_per_1m ?? 500) / 100).toFixed(0)} per 1M tokens` },
      ],
    },
    {
      name: 'Team & seats',
      rows: [
        { label: 'Seats included', free: String(free.included_seats), team: String(team.included_seats) },
        { label: 'Extra seats', free: '—', team: `$${((team.extra_seat_price_cents ?? 900) / 100).toFixed(0)} per seat / month` },
        { label: 'Seat management', free: false, team: true },
        { label: 'Order history & billing', free: false, team: true },
      ],
    },
    {
      name: 'Support',
      rows: [{ label: 'Support level', free: 'Community support', team: 'Priority email support' }],
    },
  ];
}
