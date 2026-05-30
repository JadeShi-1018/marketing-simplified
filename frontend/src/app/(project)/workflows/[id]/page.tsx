import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import AgentWorkflowEditor from '@/components/workflows/agent/AgentWorkflowEditor';

export default function WorkflowDetailPage({
  params,
}: {
  params: { id: string }
}) {
  return (
    <ProtectedRoute>
      <DashboardLayout mainClassName="!p-0">
        <AgentWorkflowEditor workflowId={params.id} />
      </DashboardLayout>
    </ProtectedRoute>
  );
}
