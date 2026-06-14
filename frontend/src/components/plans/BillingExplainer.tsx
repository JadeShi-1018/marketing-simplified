import { BarChart3, Calculator, Users } from 'lucide-react';

const blocks = [
  { icon: Users, title: '1. Base plan & included seats', body: 'Team starts at $49 AUD/month and includes 5 seats.' },
  { icon: Calculator, title: '2. Extra seats', body: 'Add as many seats as you need at $9 AUD per seat, per month.' },
  { icon: BarChart3, title: '3. Token overage', body: 'Go beyond 5M tokens at $5 AUD per additional 1M tokens.' },
];

export default function BillingExplainer() {
  return (
    <section>
      <h2 className="mb-5 text-center text-2xl font-semibold text-gray-950">How pricing works</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {blocks.map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#3CCED7]/10 text-[#16a7b0]"><Icon className="h-5 w-5" /></div>
            <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-gray-500">{body}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-xl bg-gradient-to-r from-[#3CCED7]/10 to-[#A6E661]/10 px-5 py-4 text-center text-sm text-gray-700">
        <span className="font-semibold">Example: 10 seats</span>
        <span className="mx-3 text-gray-400">→</span>
        $49 + 5 × $9 = <span className="font-semibold text-[#159ea7]">$94 AUD/month</span>
      </div>
    </section>
  );
}
