import WorkflowEditor from "@/components/workflows/WorkflowEditor";

export default function WorkflowEditPage({ params }: { params: { id: string } }) {
  const workflowId = String(params.id);

  return <WorkflowEditor workflowId={workflowId} />;
}

