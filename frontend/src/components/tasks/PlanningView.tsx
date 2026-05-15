'use client';

import { CalendarRange } from 'lucide-react';

export default function PlanningView({ projectId }: { projectId: number | null }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#3CCED7]/10">
        <CalendarRange className="h-6 w-6 text-[#3CCED7]" />
      </div>
      <h2 className="text-base font-semibold text-gray-900">Planning</h2>
      <p className="mt-1 text-sm text-gray-400">Sprint planning and capacity management coming soon.</p>
    </div>
  );
}
