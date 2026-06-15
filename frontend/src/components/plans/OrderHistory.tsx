'use client';

import { useEffect, useState } from 'react';
import { Download, ReceiptText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { Payment } from '@/hooks/usePlan';

export default function OrderHistory({
  fetchPayments,
  hideWhenEmpty = false,
}: {
  fetchPayments: () => Promise<Payment[]>;
  hideWhenEmpty?: boolean;
}) {
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchPayments().then(setPayments).catch(() => setError(true));
  }, [fetchPayments]);

  if (error) return <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">Unable to load order history.</div>;
  if (payments === null) return <Skeleton className="h-40 w-full rounded-xl" />;
  if (payments.length === 0) {
    return hideWhenEmpty ? null : (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
        No invoices yet
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <ReceiptText className="h-5 w-5 text-[#3CCED7]" />
        <h2 className="font-semibold text-gray-900">Order history</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[640px] w-full text-sm">
          <thead className="border-y border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr><th className="px-3 py-3">Date</th><th className="px-3 py-3">Description</th><th className="px-3 py-3">Amount</th><th className="px-3 py-3">Status</th><th className="px-3 py-3 text-right">Receipt</th></tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.id} className="border-b border-gray-100 last:border-0">
                <td className="px-3 py-3 text-gray-600">{payment.created ? new Date(payment.created).toLocaleDateString() : '—'}</td>
                <td className="px-3 py-3 font-medium text-gray-800">{payment.description || payment.number || 'Team subscription'}</td>
                <td className="px-3 py-3 text-gray-700">${(payment.amount_paid_cents / 100).toFixed(2)} {payment.currency}</td>
                <td className="px-3 py-3"><Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">{payment.status || 'unknown'}</Badge></td>
                <td className="px-3 py-3 text-right">
                  {(payment.hosted_invoice_url || payment.invoice_pdf) && <a aria-label={`Download ${payment.number ?? payment.id}`} href={payment.hosted_invoice_url || payment.invoice_pdf || '#'} target="_blank" rel="noreferrer" className="inline-flex rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-[#2AB5BD]"><Download className="h-4 w-4" /></a>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
