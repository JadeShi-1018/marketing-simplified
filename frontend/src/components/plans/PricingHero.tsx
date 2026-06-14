import { DecorativeGlow } from '@/components/ui/decorative-glow';

interface PricingHeroProps {
  title?: string;
  highlight?: string;
  subhead?: string;
}

export default function PricingHero({
  title = 'Simple plans for every',
  highlight = 'advertising team',
  subhead = 'Start free and upgrade when your team needs more seats, higher AI limits, and shared billing tools.',
}: PricingHeroProps) {
  return (
    <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#3CCED7]/10 via-white to-[#A6E661]/10 px-6 py-14 text-center sm:px-10">
      <DecorativeGlow variant="subtle" />
      <div className="relative mx-auto max-w-3xl">
        <span className="inline-flex rounded-full bg-[#3CCED7]/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-teal-700">
          Pricing
        </span>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight text-gray-950 sm:text-5xl">
          {title}{' '}
          <span className="bg-gradient-to-r from-[#3CCED7] to-[#A6E661] bg-clip-text text-transparent">
            {highlight}
          </span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-gray-600">{subhead}</p>
      </div>
    </section>
  );
}
