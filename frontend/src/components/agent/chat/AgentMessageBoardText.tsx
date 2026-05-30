"use client"

import { useId } from "react"
import { cn } from "@/lib/utils"
import { useAgentMessageBoardText } from "@/hooks/useAgentMessageBoardText"

export type AgentMessageBoardTextProps = {
  target: string
  className?: string
  partId?: string
  /** When set, text types only while this block job is active. */
  blockId?: string
}

/**
 * Renders assistant/agent copy with sequential typing inside the board render queue.
 */
export function AgentMessageBoardText({
  target,
  className,
  partId: partIdProp,
  blockId,
}: AgentMessageBoardTextProps) {
  const fallbackId = useId()
  const partId = partIdProp ?? fallbackId.replace(/:/g, "")
  const { displayed, isWaiting } = useAgentMessageBoardText({ target, partId, blockId })

  const visible =
    displayed.length > 0 ? displayed : isWaiting && target.length > 0 ? "\u00a0" : ""

  return (
    <span className={cn(className)} data-agent-text-part={partId}>
      {visible}
    </span>
  )
}
