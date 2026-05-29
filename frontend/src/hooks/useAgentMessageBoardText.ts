"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { useAgentMessageBoardTextContext } from "@/components/agent/chat/AgentMessageBoardTextContext"
import {
  advanceTypingDisplay,
  computeAdaptiveMsPerChar,
  getBacklog,
  sliceByCodePoints,
  textLength,
} from "@/lib/streamingTextUtils"

export type UseAgentMessageBoardTextOptions = {
  target: string
  partId: string
  blockId?: string
}

export type UseAgentMessageBoardTextResult = {
  displayed: string
  isTyping: boolean
  isWaiting: boolean
}

function isDisplayedPrefixOfTarget(target: string, displayed: string): boolean {
  if (!displayed) return true
  return sliceByCodePoints(target, textLength(displayed)) === displayed
}

function displayedForResumeLength(target: string, resumeLength: number): string {
  if (resumeLength <= 0) return ""
  return sliceByCodePoints(target, Math.min(resumeLength, textLength(target)))
}

export function useAgentMessageBoardText({
  target,
  partId,
  blockId,
}: UseAgentMessageBoardTextOptions): UseAgentMessageBoardTextResult {
  const {
    sessionId,
    isStreaming,
    queueVersion,
    registerTextPart,
    isTextPartActive,
    isTextPartComplete,
    shouldSkipTyping,
    markTextPartComplete,
    reopenTextPart,
    getPartGeneration,
    getPartResumeLength,
    reportTextPartDisplay,
  } = useAgentMessageBoardTextContext()

  const generation = getPartGeneration(partId)
  const skipTyping = shouldSkipTyping(partId)
  const canType = isTextPartActive(partId, blockId)
  const complete = isTextPartComplete(partId, blockId)

  const [displayed, setDisplayed] = useState(() =>
    displayedForResumeLength(target, getPartResumeLength(partId))
  )
  const displayedRef = useRef(displayed)
  const rafRef = useRef<number | null>(null)
  const lastFrameRef = useRef<number | null>(null)
  const carryoverMsRef = useRef(0)
  const prevTargetLenRef = useRef(0)
  const receivedStreamChunksRef = useRef(false)

  displayedRef.current = displayed

  const cancelRaf = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    lastFrameRef.current = null
  }, [])

  useLayoutEffect(
    () => registerTextPart(partId, blockId),
    [partId, blockId, registerTextPart, sessionId]
  )

  useLayoutEffect(() => {
    if (skipTyping) {
      if (displayedRef.current !== target) {
        displayedRef.current = target
        setDisplayed(target)
      }
      return
    }
    if (complete) return

    const len = getPartResumeLength(partId)
    const prefix = displayedForResumeLength(target, len)
    if (displayedRef.current === prefix) return
    displayedRef.current = prefix
    setDisplayed(prefix)
    carryoverMsRef.current = 0
    cancelRaf()
  }, [
    sessionId,
    partId,
    blockId,
    target,
    skipTyping,
    complete,
    getPartResumeLength,
    queueVersion,
    cancelRaf,
  ])

  useLayoutEffect(() => {
    if (!skipTyping || complete) return
    markTextPartComplete(partId, blockId)
  }, [skipTyping, complete, partId, blockId, markTextPartComplete])

  useEffect(() => {
    if (skipTyping) return
    if (generation === 0) return
    displayedRef.current = ""
    setDisplayed("")
    carryoverMsRef.current = 0
    prevTargetLenRef.current = 0
    receivedStreamChunksRef.current = false
    cancelRaf()
  }, [generation, skipTyping, cancelRaf])

  useEffect(() => {
    const len = textLength(target)
    if (len > prevTargetLenRef.current) {
      receivedStreamChunksRef.current = true
    }
    prevTargetLenRef.current = len
  }, [target])

  useEffect(() => {
    if (skipTyping) return
    if (complete && getBacklog(target, displayedRef.current) > 0) {
      reopenTextPart(partId, blockId)
    }
  }, [target, complete, skipTyping, partId, blockId, reopenTextPart])

  useEffect(() => {
    if (canType && !complete && target.length === 0) {
      markTextPartComplete(partId, blockId)
    }
  }, [target, canType, complete, partId, blockId, markTextPartComplete])

  const scheduleLoop = useCallback(() => {
    cancelRaf()
    const loop = (timestamp: number) => {
      if (!isTextPartActive(partId, blockId)) {
        rafRef.current = null
        return
      }

      const last = lastFrameRef.current
      lastFrameRef.current = timestamp
      const elapsed = last != null ? timestamp - last : 0
      carryoverMsRef.current += elapsed

      let current = displayedRef.current
      if (!isDisplayedPrefixOfTarget(target, current)) {
        current = ""
        carryoverMsRef.current = 0
      }

      const backlog = getBacklog(target, current)
      if (backlog <= 0) {
        if (current !== target) {
          displayedRef.current = target
          setDisplayed(target)
        }
        markTextPartComplete(partId, blockId)
        rafRef.current = null
        return
      }

      const expectMoreContent =
        isStreaming && receivedStreamChunksRef.current
      const msPerChar = computeAdaptiveMsPerChar({ backlog, expectMoreContent })

      const next = advanceTypingDisplay(target, current, carryoverMsRef.current, msPerChar)
      const charsRevealed = textLength(next) - textLength(current)
      carryoverMsRef.current = Math.max(
        0,
        carryoverMsRef.current - charsRevealed * msPerChar
      )

      if (next !== current) {
        displayedRef.current = next
        setDisplayed(next)
      }

      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
  }, [
    target,
    isStreaming,
    partId,
    blockId,
    cancelRaf,
    isTextPartActive,
    markTextPartComplete,
  ])

  useEffect(() => {
    if (complete) {
      cancelRaf()
      if (displayedRef.current !== target) {
        displayedRef.current = target
        setDisplayed(target)
      }
      return
    }

    if (skipTyping) {
      cancelRaf()
      if (displayedRef.current !== target) {
        displayedRef.current = target
        setDisplayed(target)
      }
      return
    }

    if (!canType) {
      cancelRaf()
      return
    }

    if (!isDisplayedPrefixOfTarget(target, displayedRef.current)) {
      const resumeLen = getPartResumeLength(partId)
      if (resumeLen > 0 && textLength(target) > 0) {
        const recovered = displayedForResumeLength(target, resumeLen)
        displayedRef.current = recovered
        setDisplayed(recovered)
      } else {
        displayedRef.current = ""
        setDisplayed("")
      }
      carryoverMsRef.current = 0
    }

    if (getBacklog(target, displayedRef.current) > 0) {
      scheduleLoop()
    } else if (displayedRef.current !== target) {
      displayedRef.current = target
      setDisplayed(target)
      markTextPartComplete(partId, blockId)
    }

    return cancelRaf
  }, [
    target,
    skipTyping,
    canType,
    complete,
    partId,
    blockId,
    queueVersion,
    scheduleLoop,
    cancelRaf,
    markTextPartComplete,
    getPartResumeLength,
  ])

  const isWaiting = !skipTyping && !canType && !complete
  const visibleDisplayed = skipTyping || complete ? target : displayed
  const isTyping = !skipTyping && canType && getBacklog(target, visibleDisplayed) > 0

  useEffect(() => {
    if (textLength(target) === 0) return
    const len = textLength(visibleDisplayed)
    if (len === 0 && getPartResumeLength(partId) > 0) return
    reportTextPartDisplay(partId, len)
  }, [partId, target, visibleDisplayed, reportTextPartDisplay, getPartResumeLength])

  return { displayed: visibleDisplayed, isTyping, isWaiting }
}
