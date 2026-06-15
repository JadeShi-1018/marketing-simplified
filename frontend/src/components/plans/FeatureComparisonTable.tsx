import { Check, Minus } from 'lucide-react';
import type { Plan } from '@/hooks/usePlan';
import { buildComparisonData, type ComparisonValue } from './comparisonData';

function Value({ value }: { value: ComparisonValue }) {
  if (value === true) return <Check aria-label="Included" className="mx-auto h-4 w-4 stroke-[2.25] text-[#3CCED7]" />;
  if (value === false) return <Minus aria-label="Not included" className="mx-auto h-4 w-4 text-gray-300" />;
  return <span>{value}</span>;
}

export default function FeatureComparisonTable({ plans }: { plans: Plan[] }) {
  return (
    <section>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full min-w-[760px] table-fixed text-xs text-gray-800">
          <thead className="text-gray-900">
            <tr>
              <th colSpan={2} className="w-[54%] px-5 py-3 text-left font-bold">What&apos;s included</th>
              <th className="w-[23%] px-3 py-3 text-center font-bold">Free</th>
              <th className="w-[23%] bg-[#3CCED7]/8 px-3 py-3 text-center font-bold">Team</th>
            </tr>
          </thead>
          <tbody>
            {buildComparisonData(plans).flatMap((group) => {
              const GroupIcon = group.icon;
              return group.rows.map((row, rowIndex) => (
                <tr key={`${group.name}-${row.label}`} className={rowIndex === 0 ? 'border-t border-gray-200' : 'border-t border-gray-100'}>
                  {rowIndex === 0 && (
                    <th
                      rowSpan={group.rows.length}
                      scope="rowgroup"
                      className="w-[22%] border-r border-gray-200 px-5 py-2 text-left align-middle font-bold text-gray-900"
                    >
                      <span className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#3CCED7]/[0.14] text-[#3CCED7]">
                          <GroupIcon aria-hidden className="h-[22px] w-[22px] stroke-2" />
                        </span>
                        <span>{group.name}</span>
                      </span>
                    </th>
                  )}
                  <td className="w-[32%] border-r border-gray-100 px-5 py-1.5 font-medium text-gray-700">{row.label}</td>
                  <td className="w-[23%] px-3 py-1.5 text-center font-medium text-gray-700"><Value value={row.free} /></td>
                  <td className="w-[23%] bg-[#3CCED7]/[0.035] px-3 py-1.5 text-center font-semibold text-gray-900"><Value value={row.team} /></td>
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
