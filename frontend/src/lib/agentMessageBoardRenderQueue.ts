export type RenderJobKind = "text" | "block"

export type RenderJob = {
  id: string
  kind: RenderJobKind
}

export function getFirstIncompleteJobId(
  jobs: RenderJob[],
  completed: Set<string>
): string | null {
  for (const job of jobs) {
    if (!completed.has(job.id)) return job.id
  }
  return null
}

export function getFirstIncompletePartId(
  order: string[],
  completed: Set<string>
): string | null {
  for (const partId of order) {
    if (!completed.has(partId)) return partId
  }
  return null
}

export function areAllPartsComplete(order: string[], completed: Set<string>): boolean {
  if (order.length === 0) return true
  return order.every((id) => completed.has(id))
}
