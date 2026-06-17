import type { Metadata } from 'next';
import PublicPageShell from '@/components/home/PublicPageShell';
import PublicPricingContent from '@/components/plans/PublicPricingContent';

export const metadata: Metadata = {
  title: 'Pricing Docs | Marketing Simplified',
  description: 'Compare Marketing Simplified plan tiers, usage drivers, rollout needs, and pricing questions.',
};

export default function DocsPricingPage() {
  return (
    <PublicPageShell>
      <PublicPricingContent />
    </PublicPageShell>
  );
}
