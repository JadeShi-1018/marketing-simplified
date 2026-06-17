import type { WorkflowStepType } from "@/types/agent"
import { SELECTABLE_STEP_TYPES, type StepCategory } from "./stepTypeMeta"

/** Default analysis pipeline matching the system workflow pattern. */
export const DEFAULT_PIPELINE_STEPS: Array<{
  name: string
  step_type: WorkflowStepType
  config?: Record<string, unknown>
}> = [
  { name: "Analyze Data", step_type: "analyze_data" },
  {
    name: "Confirm Analysis",
    step_type: "await_confirmation",
    config: {
      message:
        "Analysis complete. Would you like to create tasks based on these findings?",
    },
  },
  { name: "Create Tasks", step_type: "create_tasks" },
]

const CATEGORY_ORDER: StepCategory[] = ["data", "gate", "action", "integration"]

const CATEGORY_LABELS: Record<StepCategory, string> = {
  data: "Data Pipeline",
  gate: "Human Gate",
  action: "Actions",
  integration: "Integrations",
  legacy: "Legacy",
}

export function getGroupedStepTypes() {
  return CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    options: SELECTABLE_STEP_TYPES.filter((s) => s.category === category),
  })).filter((group) => group.options.length > 0)
}
