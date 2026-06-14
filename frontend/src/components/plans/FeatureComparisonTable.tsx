import { Check, Minus } from 'lucide-react';
import type { Plan } from '@/hooks/usePlan';
import { buildComparisonData, type ComparisonValue } from './comparisonData';

function Value({ value }: { value: ComparisonValue }) {
  if (value === true) return <Check aria-label="Included" className="mx-auto h-4 w-4 text-[#16a7b0]" />;
  if (value === false) return <Minus aria-label="Not included" className="mx-auto h-4 w-4 text-gray-300" />;
  return <span>{value}</span>;
}

export default function FeatureComparisonTable({ plans }: { plans: Plan[] }) {
  return (
    <section>
      <div className="mb-5 text-center">
        <h2 className="text-2xl font-semibold text-gray-950">Compare plans</h2>
        <p className="mt-2 text-sm text-gray-500">The workspace is shared. Limits, seats, support, and billing tools scale with Team.</p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-[680px] w-full text-sm">
          <thead className="bg-gray-50 text-gray-900">
            <tr>
              <th className="w-1/2 px-5 py-4 text-left font-semibold">Feature</th>
              <th className="w-1/4 px-4 py-4 text-center font-semibold">Free</th>
              <th className="w-1/4 bg-[#3CCED7]/5 px-4 py-4 text-center font-semibold">Team</th>
            </tr>
          </thead>
          <tbody>
            {buildComparisonData(plans).flatMap((group) => [
              <tr key={`${group.name}-heading`} className="border-t border-gray-200 bg-gray-50/70">
                <th colSpan={3} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">{group.name}</th>
              </tr>,
              ...group.rows.map((row) => (
                <tr key={`${group.name}-${row.label}`} className="border-t border-gray-100">
                  <td className="px-5 py-3 text-gray-700">{row.label}</td>
                  <td className="px-4 py-3 text-center text-gray-600"><Value value={row.free} /></td>
                  <td className="bg-[#3CCED7]/[0.025] px-4 py-3 text-center font-medium text-gray-800"><Value value={row.team} /></td>
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>
    </section>
  );
}
