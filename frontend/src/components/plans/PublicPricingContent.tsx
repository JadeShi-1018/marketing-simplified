'use client';

import Link from 'next/link';
import BillingExplainer from './BillingExplainer';
import FeatureComparisonTable from './FeatureComparisonTable';
import PlanCardsRow from './PlanCardsRow';
import PricingFAQ from './PricingFAQ';
import PricingHero from './PricingHero';
import { publicPricingPlans } from './comparisonData';

export default function PublicPricingContent() {
  const goToLogin = async () => {
    window.location.href = '/login';
  };

  return (
    <div className="mx-auto max-w-6xl space-y-14 px-5 py-10 sm:px-8 sm:py-14">
      <PricingHero />
      <PlanCardsRow plans={publicPricingPlans} onSelect={goToLogin} />
      <FeatureComparisonTable plans={publicPricingPlans} />
      <BillingExplainer />
      <PricingFAQ />
      <section className="rounded-2xl bg-gradient-to-r from-[#3CCED7]/15 via-white to-[#A6E661]/20 px-6 py-10 text-center shadow-sm">
        <h2 className="text-2xl font-semibold text-gray-950">Ready to simplify your team&apos;s work?</h2>
        <p className="mt-2 text-sm text-gray-600">Start free, then add seats and AI capacity when your team is ready.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/login" className="rounded-lg border border-[#3CCED7] bg-white px-6 py-3 text-sm font-semibold text-[#3CCED7]">Start for free</Link>
          <Link href="/login" className="rounded-lg bg-gradient-to-r from-[#3CCED7] to-[#A6E661] px-6 py-3 text-sm font-semibold text-gray-900 shadow-sm">Start Team</Link>
        </div>
      </section>
    </div>
  );
}
