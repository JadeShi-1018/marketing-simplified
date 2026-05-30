"use client"

import { useLayoutEffect } from "react"
import { cn } from "@/lib/utils"
import { useAgentMessageBoardTextContext } from "./AgentMessageBoardTextContext"

export type AgentMessageBoardBlockProps = {
  /** Unique block job id in the render linked list. */
  blockId: string
  children: React.ReactNode
  className?: string
}

/**
 * Gates a UI block so it only mounts after prior render jobs finish.
 * Text inside should use AgentMessageBoardText with the same blockId.
 */
export function AgentMessageBoardBlock({
  blockId,
  children,
  className,
}: AgentMessageBoardBlockProps) {
  const {
    sessionId,
    registerBlock,
    isBlockRevealed,
    tryCompleteEmptyBlock,
    queueVersion,
    getBlockTextPartIds,
    shouldSkipTyping,
    markTextPartComplete,
  } = useAgentMessageBoardTextContext()

  // Re-evaluate reveal when the session FIFO queue advances (refs alone do not re-render).
  void queueVersion
  const revealed = isBlockRevealed(blockId)

  useLayoutEffect(
    () => registerBlock(blockId),
    [blockId, registerBlock, sessionId]
  )

  useLayoutEffect(() => {
    if (!revealed) return
    const partIds = getBlockTextPartIds(blockId)
    if (partIds.length === 0) return
    if (!partIds.every((partId) => shouldSkipTyping(partId))) return
    for (const partId of partIds) {
      markTextPartComplete(partId, blockId)
    }
  }, [
    revealed,
    blockId,
    queueVersion,
    getBlockTextPartIds,
    shouldSkipTyping,
    markTextPartComplete,
  ])

  useLayoutEffect(() => {
    if (!revealed) return
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        tryCompleteEmptyBlock(blockId)
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [revealed, blockId, queueVersion, tryCompleteEmptyBlock])

  if (!revealed) return null

  return <div className={cn(className)} data-agent-block={blockId}>{children}</div>
}
