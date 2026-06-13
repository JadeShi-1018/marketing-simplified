"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  MarkerType,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
} from "reactflow";
import "reactflow/dist/style.css";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { AgentAPI } from "@/lib/api/agentApi";
import type { AgentWorkflowTemplate, AgentWorkflowStep } from "@/types/agent";
import { useAgentWorkflowProjectParams } from "../hooks/useAgentWorkflows";
import { getStepMeta } from "./canvasStepMeta";
import AgentStepNode, { type AgentStepNodeData } from "./nodes/AgentStepNode";
import AgentStepEdge, { type AgentStepEdgeData } from "./edges/AgentStepEdge";
import TemplateInfoDrawer from "../templates/TemplateInfoDrawer";

// Node and edge type registry
const nodeTypes = {
  agentStep: AgentStepNode,
};

const edgeTypes = {
  agentStepEdge: AgentStepEdge,
};

// Layout constants
const STEP_X_GAP = 200;
const NODE_Y = 0;

// ── Inner canvas (needs ReactFlow context) ────────────────────────────────────
interface CanvasInnerProps {
  template: AgentWorkflowTemplate;
  steps: AgentWorkflowStep[];
  onCreateWorkflow: () => void;
  onCancel: () => void;
  isCreating: boolean;
}

function CanvasInner({ template, steps, onCreateWorkflow, onCancel, isCreating }: CanvasInnerProps) {
  const { fitView } = useReactFlow();

  // Fit view on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      fitView({ padding: 0.6 });
    }, 50);
    return () => clearTimeout(timer);
  }, [fitView]);

  // ── Derive RF nodes (read-only, no selection, no add button) ───────────────
  const rfNodes: Node[] = useMemo(() => {
    return steps.map((step, idx): Node<AgentStepNodeData> => ({
      id: step.id,
      type: "agentStep",
      position: { x: idx * STEP_X_GAP, y: NODE_Y },
      draggable: false,
      selectable: false,
      data: {
        step,
        isSelected: false,
        hasNext: idx < steps.length - 1,
        onDelete: undefined, // No delete in preview mode
        onInsertAfter: undefined, // No insert in preview mode
      },
    }));
  }, [steps]);

  // ── Derive RF edges ─────────────────────────────────────────────────────────
  const rfEdges: Edge[] = useMemo(() => {
    const edges: Edge[] = [];

    for (let i = 0; i < steps.length - 1; i++) {
      const meta = getStepMeta(steps[i].step_type);
      edges.push({
        id: `e-${steps[i].id}-${steps[i + 1].id}`,
        source: steps[i].id,
        target: steps[i + 1].id,
        type: "agentStepEdge",
        markerEnd: { type: MarkerType.ArrowClosed, color: meta.edgeColor, width: 16, height: 16 },
        data: {
          label: meta.label,
          color: meta.edgeColor,
        } satisfies AgentStepEdgeData,
      });
    }

    return edges;
  }, [steps]);

  return (
    <div className="relative h-full w-full">
      {/* Left sidebar - Template Info Drawer */}
      <div className="absolute left-0 top-0 z-20 h-full">
        <TemplateInfoDrawer
          template={template}
          onCreateWorkflow={onCreateWorkflow}
          onCancel={onCancel}
          isCreating={isCreating}
        />
      </div>

      {/* React Flow canvas (with left offset for drawer) */}
      <div className="h-full w-full pl-[33.333333%]">
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.6 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnScroll
          zoomOnScroll
          minZoom={0.3}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          // Required to keep pointer-events on nodes
          onNodeClick={() => {}}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} color="#cbd5e1" />
        </ReactFlow>
      </div>

      {/* Top bar with template name (read-only) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 py-3 pl-[calc(33.333333%+1rem)]">
        <div className="pointer-events-auto">
          <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 shadow-sm">
            <span className="text-sm font-semibold text-slate-800">
              {template.workflow_name || "Template Workflow"}
            </span>
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
              Preview
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
interface TemplatePreviewCanvasProps {
  template: AgentWorkflowTemplate;
  onBack: () => void;
}

export default function TemplatePreviewCanvas({ template, onBack }: TemplatePreviewCanvasProps) {
  const router = useRouter();
  const { projectParams } = useAgentWorkflowProjectParams();
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);

  // Use template's own steps_config (no need to fetch workflow)
  // Add temporary IDs for React Flow nodes
  const steps = useMemo(() => {
    if (!template.steps_config) return [];
    return template.steps_config.map((step, index) => ({
      ...step,
      id: `template-step-${index}`, // Temporary ID for display
    }));
  }, [template.steps_config]);

  const handleCreateWorkflow = useCallback(async () => {
    // Prevent duplicate clicks
    if (creatingRef.current || creating) {
      console.warn("[CREATE] Already creating workflow, ignoring duplicate call");
      return;
    }

    if (!projectParams?.project_id) {
      toast.error("Project ID is required");
      return;
    }

    creatingRef.current = true;
    setCreating(true);

    try {
      console.log("[CREATE] Starting workflow creation from template:", template.id);
      console.log("[CREATE] Project ID:", projectParams.project_id);

      const newWorkflow = await AgentAPI.applyTemplate(template.id, {
        project_id: projectParams.project_id,
        name: template.name, // Use template name as initial workflow name
      });

      console.log("[CREATE] Created workflow:", newWorkflow);
      console.log("[CREATE] Workflow ID:", newWorkflow.id);

      if (!newWorkflow.id) {
        throw new Error("Created workflow has no ID");
      }

      toast.success("Workflow created successfully");

      // Navigate to the new workflow canvas with new=1 parameter
      const targetUrl = `/workflows/${newWorkflow.id}?new=1`;
      console.log("[CREATE] Navigating to:", targetUrl);
      router.push(targetUrl);
    } catch (err) {
      console.error("[CREATE] Failed to create workflow:", err);
      toast.error("Failed to create workflow");
      creatingRef.current = false; // Reset on error
    } finally {
      setCreating(false);
    }
  }, [template.id, template.name, projectParams, router, creating]);

  if (steps.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-gray-500">No steps found in this template</p>
          <button
            type="button"
            onClick={onBack}
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <CanvasInner
        template={template}
        steps={steps}
        onCreateWorkflow={handleCreateWorkflow}
        onCancel={onBack}
        isCreating={creating}
      />
    </ReactFlowProvider>
  );
}
