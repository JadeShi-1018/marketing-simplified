import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import AgentWorkflowCanvas from '@/components/workflows/agent/canvas/AgentWorkflowCanvas';

export default function WorkflowDetailPage({
  params,
}: {
  params: { id: string }
}) {
  return (
    <ProtectedRoute>
      {/* Full-screen canvas — no DashboardLayout (sidebar excluded intentionally) */}
      <AgentWorkflowCanvas workflowId={params.id} />
    </ProtectedRoute>
  );
}
