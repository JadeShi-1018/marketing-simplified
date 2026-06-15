import type { AgentWorkflowTemplate } from "@/types/agent"

/** Compare template creator to current user (handles number/string UUID mismatches). */
export function isTemplateOwner(
  template: AgentWorkflowTemplate,
  userId: string | number | null | undefined
): boolean {
  if (userId == null || userId === "") return false
  const createdBy = String(template.created_by ?? "").trim()
  const uid = String(userId).trim()
  return createdBy !== "" && createdBy === uid
}
