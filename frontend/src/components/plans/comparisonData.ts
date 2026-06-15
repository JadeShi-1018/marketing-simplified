import type { Plan } from '@/hooks/usePlan';
import { formatTokens } from '@/lib/format';
import {
  ChartNoAxesColumnIncreasing,
  Files,
  Gauge,
  Headphones,
  LayoutGrid,
  Users,
  type LucideIcon,
} from 'lucide-react';

// TODO(PM): confirm any real per-module Free/Team gating.

export type ComparisonValue = boolean | string;

export interface ComparisonRow {
  label: string;
  free: ComparisonValue;
  team: ComparisonValue;
}

export interface ComparisonGroup {
  name: string;
  icon: LucideIcon;
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
      name: 'Core platform',
      icon: LayoutGrid,
      rows: moduleRows(['Campaigns', 'AI Agent', 'Meta Ads', 'Tasks', 'Decisions', 'Budget Pools', 'Spreadsheets']),
    },
    {
      name: 'Content & creation',
      icon: ChartNoAxesColumnIncreasing,
      rows: moduleRows(['Variations Studio', 'Ads Draft', 'Email Draft', 'Notion']),
    },
    {
      name: 'Collaboration',
      icon: Users,
      rows: moduleRows(['Meetings', 'Calendar', 'Messages', 'Miro']),
    },
    {
      name: 'Usage & limits',
      icon: Gauge,
      rows: [
        { label: 'Monthly AI tokens', free: formatTokens(free.monthly_token_quota), team: formatTokens(team.monthly_token_quota) },
        { label: 'Seats', free: String(free.included_seats), team: String(team.included_seats) },
        { label: 'Overage', free: 'Hard limit', team: `$${((team.overage_price_cents_per_1m ?? 500) / 100).toFixed(0)} / 1M tokens` },
      ],
    },
    {
      name: 'Support',
      icon: Headphones,
      rows: [{ label: 'Support level', free: 'Community', team: 'Priority email support' }],
    },
    {
      name: 'Billing & admin',
      icon: Files,
      rows: [
        { label: 'Invoices', free: 'Basic', team: 'Full' },
        { label: 'Payment history', free: false, team: true },
        { label: 'Usage reports', free: false, team: true },
      ],
    },
  ];
}
