import type { WorkflowStepType } from "@/types/agent"

export type StepCategory = "data" | "gate" | "action" | "integration" | "legacy"

export interface StepTypeMeta {
  value: WorkflowStepType
  label: string
  description: string
  category: StepCategory
  deprecated?: boolean
  selectable?: boolean
}

export const STEP_TYPE_META: StepTypeMeta[] = [
  {
    value: "detect_columns",
    label: "Detect Columns",
    description: "Detect and map spreadsheet column types.",
    category: "data",
    selectable: true,
  },
  {
    value: "await_confirmation",
    label: "Await Confirmation",
    description: "Pause and ask the user to confirm before continuing.",
    category: "gate",
    selectable: true,
  },
  {
    value: "normalize_data",
    label: "Normalize Data",
    description: "Normalize imported data using detected column mappings.",
    category: "data",
    selectable: true,
  },
  {
    value: "generate_criteria",
    label: "Generate Criteria",
    description: "Generate analysis criteria from normalized data.",
    category: "data",
    selectable: true,
  },
  {
    value: "analyze_data",
    label: "Analyze Data",
    description: "Run spreadsheet analysis and produce insights.",
    category: "data",
    selectable: true,
  },
  {
    value: "call_llm",
    label: "Call LLM",
    description: "Run a direct LLM analysis step.",
    category: "action",
    selectable: true,
  },
  {
    value: "create_tasks",
    label: "Create Tasks",
    description: "Create tasks from analysis recommendations.",
    category: "action",
    selectable: true,
  },
  {
    value: "custom_api",
    label: "Custom API",
    description: "Call an external HTTP endpoint.",
    category: "action",
    selectable: true,
  },
  {
    value: "generate_miro_snapshot",
    label: "Generate Miro Snapshot",
    description: "Generate a Miro board snapshot from analysis.",
    category: "integration",
    selectable: true,
  },
  {
    value: "create_miro_board",
    label: "Create Miro Board",
    description: "Create a Miro board from workflow output.",
    category: "integration",
    selectable: true,
  },
  {
    value: "create_decision",
    label: "Create Decision",
    description: "Legacy step — no longer creates decisions.",
    category: "legacy",
    deprecated: true,
    selectable: false,
  },
  {
    value: "call_dify",
    label: "Call Dify",
    description: "Legacy step — use Analyze Data instead.",
    category: "legacy",
    deprecated: true,
    selectable: false,
  },
]

export const SELECTABLE_STEP_TYPES = STEP_TYPE_META.filter((s) => s.selectable !== false)

export function getStepTypeLabel(stepType: string): string {
  return STEP_TYPE_META.find((s) => s.value === stepType)?.label ?? stepType
}

export function getDefaultStepName(stepType: WorkflowStepType): string {
  return getStepTypeLabel(stepType)
}
