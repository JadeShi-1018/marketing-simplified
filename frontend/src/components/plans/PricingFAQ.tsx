'use client';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

const items = [
  ['Can I start for free?', 'Yes. Free includes the core workspace, 500K monthly tokens, and one seat with no credit card required.'],
  ['What happens if I exceed my Free plan limit?', 'Free usage stops at the monthly token limit. Upgrade to Team for a larger allowance and metered overage.'],
  ['How many seats are included?', 'Free includes one seat. Team includes five seats, with additional seats available for $9 AUD per month each.'],
  ['Can I cancel anytime?', 'Yes. Your Team plan remains active until the end of the current billing period, then moves to Free.'],
  ['What happens after I cancel?', 'Your workspace remains available on Free. Team limits, seat management, billing history, and priority support end after the paid period.'],
];

export default function PricingFAQ() {
  return (
    <section>
      <h2 className="mb-5 text-center text-2xl font-semibold text-gray-950">Frequently asked questions</h2>
      <Accordion type="single" collapsible className="rounded-xl border border-gray-200 bg-white px-5 shadow-sm">
        {items.map(([question, answer]) => (
          <AccordionItem key={question} value={question}>
            <AccordionTrigger className="hover:no-underline">{question}</AccordionTrigger>
            <AccordionContent className="leading-6 text-gray-500">{answer}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
