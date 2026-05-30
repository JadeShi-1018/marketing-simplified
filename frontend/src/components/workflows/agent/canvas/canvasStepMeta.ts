import {
  Activity,
  ArrowLeftRight,
  BarChart2,
  Bot,
  Camera,
  CheckSquare,
  Columns,
  GitFork,
  GitMerge,
  ListChecks,
  MessageSquare,
  RefreshCcw,
  Sparkles,
  Trello,
  Webhook,
  type LucideIcon,
} from "lucide-react"
import type { WorkflowStepType } from "@/types/agent"

export interface CanvasStepMeta {
  label: string
  shortLabel: string
  description: string
  icon: LucideIcon
  /** Tailwind bg class for the node circle */
  bgClass: string
  /** Hex for the SVG edge colour */
  edgeColor: string
  category: "data" | "gate" | "action" | "integration" | "flow" | "legacy"
}

export const CANVAS_STEP_META: Record<WorkflowStepType, CanvasStepMeta> = {
  detect_columns: {
    label: "Detect Columns",
    shortLabel: "Detect",
    description: "Detect and map spreadsheet column types.",
    icon: Columns,
    bgClass: "bg-indigo-500",
    edgeColor: "#6366f1",
    category: "data",
  },
  await_confirmation: {
    label: "Await Confirmation",
    shortLabel: "Confirm",
    description: "Pause and ask the user to confirm before continuing.",
    icon: MessageSquare,
    bgClass: "bg-amber-400",
    edgeColor: "#f59e0b",
    category: "gate",
  },
  normalize_data: {
    label: "Normalize Data",
    shortLabel: "Normalize",
    description: "Normalize imported data using detected column mappings.",
    icon: ListChecks,
    bgClass: "bg-indigo-500",
    edgeColor: "#6366f1",
    category: "data",
  },
  generate_criteria: {
    label: "Generate Criteria",
    shortLabel: "Criteria",
    description: "Generate analysis criteria from normalized data.",
    icon: Sparkles,
    bgClass: "bg-indigo-500",
    edgeColor: "#6366f1",
    category: "data",
  },
  analyze_data: {
    label: "Analyze Data",
    shortLabel: "Analyze",
    description: "Run spreadsheet analysis and produce insights.",
    icon: BarChart2,
    bgClass: "bg-indigo-500",
    edgeColor: "#6366f1",
    category: "data",
  },
  call_llm: {
    label: "Call LLM",
    shortLabel: "LLM",
    description: "Run a direct LLM analysis step.",
    icon: Bot,
    bgClass: "bg-violet-500",
    edgeColor: "#8b5cf6",
    category: "action",
  },
  create_tasks: {
    label: "Create Tasks",
    shortLabel: "Tasks",
    description: "Create tasks from analysis recommendations.",
    icon: CheckSquare,
    bgClass: "bg-emerald-500",
    edgeColor: "#10b981",
    category: "action",
  },
  custom_api: {
    label: "Custom API",
    shortLabel: "API",
    description: "Call an external HTTP endpoint.",
    icon: Webhook,
    bgClass: "bg-blue-500",
    edgeColor: "#3b82f6",
    category: "action",
  },
  generate_miro_snapshot: {
    label: "Miro Snapshot",
    shortLabel: "Snapshot",
    description: "Generate a Miro board snapshot from analysis.",
    icon: Camera,
    bgClass: "bg-rose-500",
    edgeColor: "#f43f5e",
    category: "integration",
  },
  create_miro_board: {
    label: "Miro Board",
    shortLabel: "Miro",
    description: "Create a Miro board from workflow output.",
    icon: Trello,
    bgClass: "bg-rose-500",
    edgeColor: "#f43f5e",
    category: "integration",
  },
  create_decision: {
    label: "Create Decision",
    shortLabel: "Decision",
    description: "Legacy step — creates a decision record.",
    icon: Activity,
    bgClass: "bg-gray-400",
    edgeColor: "#94a3b8",
    category: "legacy",
  },
  call_dify: {
    label: "Call Dify (Legacy)",
    shortLabel: "Dify",
    description: "Legacy step — use Analyze Data instead.",
    icon: Bot,
    bgClass: "bg-gray-400",
    edgeColor: "#94a3b8",
    category: "legacy",
  },
  // Flow control
  if_else: {
    label: "If - Else",
    shortLabel: "If/Else",
    description: "Split the flow into branches based on a condition.",
    icon: GitFork,
    bgClass: "bg-purple-600",
    edgeColor: "#9333ea",
    category: "flow",
  },
  merge: {
    label: "Merge",
    shortLabel: "Merge",
    description: "Merge multiple branches back into one.",
    icon: GitMerge,
    bgClass: "bg-purple-600",
    edgeColor: "#9333ea",
    category: "flow",
  },
  loop: {
    label: "Loop",
    shortLabel: "Loop",
    description: "Repeat a set of steps a specified number of times.",
    icon: RefreshCcw,
    bgClass: "bg-purple-600",
    edgeColor: "#9333ea",
    category: "flow",
  },
}

// ── Step picker groups ────────────────────────────────────────────────────────

export interface PickerGroup {
  label: string
  category: CanvasStepMeta["category"]
  types: WorkflowStepType[]
}

export const PICKER_GROUPS: PickerGroup[] = [
  {
    label: "Data Pipeline",
    category: "data",
    types: ["detect_columns", "normalize_data", "generate_criteria", "analyze_data"],
  },
  {
    label: "Human Gates",
    category: "gate",
    types: ["await_confirmation"],
  },
  {
    label: "Actions",
    category: "action",
    types: ["create_tasks", "call_llm", "custom_api"],
  },
  {
    label: "Integrations",
    category: "integration",
    types: ["generate_miro_snapshot", "create_miro_board"],
  },
  {
    label: "Flow Control",
    category: "flow",
    types: ["if_else", "merge", "loop"],
  },
]

export function getStepMeta(type: WorkflowStepType): CanvasStepMeta {
  return CANVAS_STEP_META[type] ?? CANVAS_STEP_META.analyze_data
}
