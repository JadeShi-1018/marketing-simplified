'use client';

import { CheckSquare } from 'lucide-react';

export default function MyActionsView({ projectId }: { projectId: number | null }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#3CCED7]/10">
        <CheckSquare className="h-6 w-6 text-[#3CCED7]" />
      </div>
      <h2 className="text-base font-semibold text-gray-900">My Actions</h2>
      <p className="mt-1 text-sm text-gray-400">Tasks assigned to or awaiting action from you coming soon.</p>
    </div>
  );
}
