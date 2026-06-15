import WorkflowEditor from "@/components/workflows/WorkflowEditor";

export default function WorkflowEditPage({ params }: { params: { slug: string } }) {
  const workflowId = String(params.slug);

  return <WorkflowEditor workflowId={workflowId} />;
}

