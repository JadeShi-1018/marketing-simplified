import { Suspense } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import WorkflowsPageLayout from '@/components/workflows/agent/WorkflowsPageLayout';

export default function WorkflowsPage() {
  return (
    <ProtectedRoute>
      <DashboardLayout mainClassName="!p-0">
        {/* useSearchParams() requires Suspense in Next.js App Router */}
        <Suspense>
          <WorkflowsPageLayout />
        </Suspense>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
