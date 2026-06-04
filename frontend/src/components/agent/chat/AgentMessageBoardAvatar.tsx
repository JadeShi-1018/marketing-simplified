"use client"

import { Bot, User } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAgentMessageBoardTextContext } from "./AgentMessageBoardTextContext"

type AgentMessageBoardAvatarProps = {
  role: "user" | "assistant"
  /** Assistant message blocks in render order; avatar appears with the first visible character. */
  blockIds?: string[]
  /** Force avatar visible (used by non-queued fallback rows). */
  forceVisible?: boolean
}

function useAssistantAvatarVisible(blockIds: string[] | undefined): boolean {
  const {
    queueVersion,
    getBlockTextPartIds,
    getTextPartVisibleLength,
    shouldSkipTyping,
    isBlockRevealed,
  } = useAgentMessageBoardTextContext()

  if (!blockIds || blockIds.length === 0) return false

  for (const blockId of blockIds) {
    const partIds = getBlockTextPartIds(blockId)
    if (partIds.length > 0) {
      const firstPartId = partIds[0]
      if (shouldSkipTyping(firstPartId)) return true
      if (getTextPartVisibleLength(firstPartId) > 0) return true
      return false
    }

    if (isBlockRevealed(blockId)) {
      // Icon-only block with no typed text parts.
      return true
    }
  }

  void queueVersion
  return false
}

export function AgentMessageBoardAvatar({
  role,
  blockIds,
  forceVisible = false,
}: AgentMessageBoardAvatarProps) {
  const assistantVisible = useAssistantAvatarVisible(role === "assistant" ? blockIds : undefined)
  const visible = role === "user" || forceVisible || assistantVisible

  if (!visible) return null

  return (
    <div
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full mt-0.5",
        role === "assistant" ? "bg-primary/20" : "bg-muted"
      )}
    >
      {role === "assistant" ? (
        <Bot className="h-4 w-4 text-primary" />
      ) : (
        <User className="h-4 w-4 text-muted-foreground" />
      )}
    </div>
  )
}
