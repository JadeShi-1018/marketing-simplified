"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  areAllPartsComplete,
  getFirstIncompleteJobId,
  getFirstIncompletePartId,
  type RenderJob,
} from "@/lib/agentMessageBoardRenderQueue"
import {
  isAgentMessageBoardTextPartRead,
  markAgentMessageBoardSessionQuit,
  markAgentMessageBoardTextPartRead,
} from "@/lib/agentMessageBoardReadState"

export type AgentMessageBoardTextContextValue = {
  /** True while the agent session is receiving streamed SSE content. */
  isStreaming: boolean
  queueVersion: number
  registerBlock: (blockId: string) => () => void
  registerTextPart: (partId: string, blockId?: string) => () => void
  isBlockRevealed: (blockId: string) => boolean
  isTextPartActive: (partId: string, blockId?: string) => boolean
  isTextPartComplete: (partId: string, blockId?: string) => boolean
  /** True when this part was read before (finished typing or user left the board). */
  shouldSkipTyping: (partId: string) => boolean
  markTextPartComplete: (partId: string, blockId?: string) => void
  reopenTextPart: (partId: string, blockId?: string) => void
  getPartGeneration: (partId: string) => number
  /** Complete a block that has no text parts (e.g. icon-only UI). */
  tryCompleteEmptyBlock: (blockId: string) => void
  /** Report how many characters are currently visible for a text part. */
  reportTextPartDisplay: (partId: string, visibleLength: number) => void
  getTextPartVisibleLength: (partId: string) => number
  getBlockTextPartIds: (blockId: string) => string[]
}

const AgentMessageBoardTextContext = createContext<AgentMessageBoardTextContextValue | null>(
  null
)

export function useAgentMessageBoardTextContext(): AgentMessageBoardTextContextValue {
  const ctx = useContext(AgentMessageBoardTextContext)
  if (!ctx) {
    throw new Error(
      "AgentMessageBoardText must be rendered inside AgentMessageBoardTextProvider (agent message board)."
    )
  }
  return ctx
}

type AgentMessageBoardTextProviderProps = {
  children: React.ReactNode
  isStreaming?: boolean
  sessionId?: string | null
  /** Message ids on the board when the user leaves; all their text parts become read. */
  boardMessageIds?: string[]
  /** Non-message part ids to mark read on quit (e.g. reupload button). */
  extraPartIdsOnQuit?: string[]
}

export function AgentMessageBoardTextProvider({
  children,
  isStreaming = false,
  sessionId = null,
  boardMessageIds = [],
  extraPartIdsOnQuit = [],
}: AgentMessageBoardTextProviderProps) {
  const [queueVersion, setQueueVersion] = useState(0)
  const jobsRef = useRef<RenderJob[]>([])
  const completedJobsRef = useRef(new Set<string>())
  const blockPartsRef = useRef(new Map<string, string[]>())
  const blockPartsCompletedRef = useRef(new Map<string, Set<string>>())
  const generationRef = useRef(new Map<string, number>())
  const partVisibleLengthRef = useRef(new Map<string, number>())

  const bumpQueue = useCallback(() => {
    setQueueVersion((v) => v + 1)
  }, [])

  const getActiveJobId = useCallback(() => {
    return getFirstIncompleteJobId(jobsRef.current, completedJobsRef.current)
  }, [])

  const getActiveJob = useCallback(() => {
    const activeId = getActiveJobId()
    if (!activeId) return null
    return jobsRef.current.find((j) => j.id === activeId) ?? null
  }, [getActiveJobId])

  const resetJobsAfter = useCallback(
    (jobId: string) => {
      const idx = jobsRef.current.findIndex((j) => j.id === jobId)
      if (idx === -1) return

      completedJobsRef.current.delete(jobId)
      generationRef.current.set(jobId, (generationRef.current.get(jobId) ?? 0) + 1)

      for (let i = idx + 1; i < jobsRef.current.length; i++) {
        const later = jobsRef.current[i]
        completedJobsRef.current.delete(later.id)
        generationRef.current.set(later.id, (generationRef.current.get(later.id) ?? 0) + 1)

        if (later.kind === "block") {
          const parts = blockPartsRef.current.get(later.id) ?? []
          const completed = blockPartsCompletedRef.current.get(later.id) ?? new Set()
          for (const partId of parts) {
            completed.delete(partId)
            generationRef.current.set(partId, (generationRef.current.get(partId) ?? 0) + 1)
          }
          blockPartsCompletedRef.current.set(later.id, completed)
        }
      }
    },
    []
  )

  const tryCompleteBlock = useCallback(
    (blockId: string) => {
      const parts = blockPartsRef.current.get(blockId) ?? []
      const completed = blockPartsCompletedRef.current.get(blockId) ?? new Set()
      if (!areAllPartsComplete(parts, completed)) return
      if (completedJobsRef.current.has(blockId)) return
      completedJobsRef.current.add(blockId)
      bumpQueue()
    },
    [bumpQueue]
  )

  const registerBlock = useCallback(
    (blockId: string) => {
      if (!jobsRef.current.some((j) => j.id === blockId)) {
        jobsRef.current.push({ id: blockId, kind: "block" })
        if (!blockPartsRef.current.has(blockId)) {
          blockPartsRef.current.set(blockId, [])
        }
        if (!blockPartsCompletedRef.current.has(blockId)) {
          blockPartsCompletedRef.current.set(blockId, new Set())
        }
        bumpQueue()
      }
      return () => {
        jobsRef.current = jobsRef.current.filter((j) => j.id !== blockId)
        completedJobsRef.current.delete(blockId)
        blockPartsRef.current.delete(blockId)
        blockPartsCompletedRef.current.delete(blockId)
        generationRef.current.delete(blockId)
        bumpQueue()
      }
    },
    [bumpQueue]
  )

  const registerTextPart = useCallback(
    (partId: string, blockId?: string) => {
      if (blockId) {
        const parts = blockPartsRef.current.get(blockId) ?? []
        if (!parts.includes(partId)) {
          blockPartsRef.current.set(blockId, [...parts, partId])
          const completed = blockPartsCompletedRef.current.get(blockId) ?? new Set()
          blockPartsCompletedRef.current.set(blockId, completed)
          bumpQueue()
        }
        return () => {
          const next = (blockPartsRef.current.get(blockId) ?? []).filter((id) => id !== partId)
          blockPartsRef.current.set(blockId, next)
          blockPartsCompletedRef.current.get(blockId)?.delete(partId)
          generationRef.current.delete(partId)
          bumpQueue()
        }
      }

      if (!jobsRef.current.some((j) => j.id === partId)) {
        jobsRef.current.push({ id: partId, kind: "text" })
        bumpQueue()
      }
      return () => {
        jobsRef.current = jobsRef.current.filter((j) => j.id !== partId)
        completedJobsRef.current.delete(partId)
        generationRef.current.delete(partId)
        bumpQueue()
      }
    },
    [bumpQueue]
  )

  const isBlockRevealed = useCallback(
    (blockId: string) => {
      if (completedJobsRef.current.has(blockId)) return true
      const active = getActiveJob()
      return active?.id === blockId && active.kind === "block"
    },
    [getActiveJob]
  )

  const isTextPartActive = useCallback(
    (partId: string, blockId?: string) => {
      if (blockId) {
        const active = getActiveJob()
        if (active?.id !== blockId || active.kind !== "block") return false
        const parts = blockPartsRef.current.get(blockId) ?? []
        const completed = blockPartsCompletedRef.current.get(blockId) ?? new Set()
        return getFirstIncompletePartId(parts, completed) === partId
      }
      const active = getActiveJob()
      return active?.id === partId && active.kind === "text"
    },
    [getActiveJob]
  )

  const isTextPartComplete = useCallback((partId: string, blockId?: string) => {
    if (blockId) {
      return blockPartsCompletedRef.current.get(blockId)?.has(partId) ?? false
    }
    return completedJobsRef.current.has(partId)
  }, [])

  const markTextPartComplete = useCallback(
    (partId: string, blockId?: string) => {
      if (sessionId) {
        markAgentMessageBoardTextPartRead(sessionId, partId)
      }

      if (blockId) {
        const completed = blockPartsCompletedRef.current.get(blockId) ?? new Set()
        if (completed.has(partId)) return
        completed.add(partId)
        blockPartsCompletedRef.current.set(blockId, completed)
        tryCompleteBlock(blockId)
        bumpQueue()
        return
      }
      if (completedJobsRef.current.has(partId)) return
      completedJobsRef.current.add(partId)
      bumpQueue()
    },
    [bumpQueue, tryCompleteBlock, sessionId]
  )

  const reopenTextPart = useCallback(
    (partId: string, blockId?: string) => {
      if (blockId) {
        const parts = blockPartsRef.current.get(blockId) ?? []
        const idx = parts.indexOf(partId)
        if (idx === -1) return

        const completed = blockPartsCompletedRef.current.get(blockId) ?? new Set()
        completed.delete(partId)
        blockPartsCompletedRef.current.set(blockId, completed)
        generationRef.current.set(partId, (generationRef.current.get(partId) ?? 0) + 1)

        for (let i = idx + 1; i < parts.length; i++) {
          const laterPart = parts[i]
          completed.delete(laterPart)
          generationRef.current.set(laterPart, (generationRef.current.get(laterPart) ?? 0) + 1)
        }
        blockPartsCompletedRef.current.set(blockId, completed)

        completedJobsRef.current.delete(blockId)
        resetJobsAfter(blockId)
        return
      }

      resetJobsAfter(partId)
    },
    [resetJobsAfter]
  )

  const getPartGeneration = useCallback((partId: string) => {
    return generationRef.current.get(partId) ?? 0
  }, [])

  const shouldSkipTyping = useCallback(
    (partId: string) => {
      if (!sessionId) return false
      return isAgentMessageBoardTextPartRead(sessionId, partId)
    },
    [sessionId]
  )

  const boardMessageIdsRef = useRef(boardMessageIds)
  const extraPartIdsOnQuitRef = useRef(extraPartIdsOnQuit)
  boardMessageIdsRef.current = boardMessageIds
  extraPartIdsOnQuitRef.current = extraPartIdsOnQuit

  useEffect(() => {
    const sid = sessionId
    return () => {
      if (!sid) return
      markAgentMessageBoardSessionQuit(
        sid,
        boardMessageIdsRef.current,
        extraPartIdsOnQuitRef.current
      )
    }
  }, [sessionId])

  const tryCompleteEmptyBlock = useCallback(
    (blockId: string) => {
      const active = getActiveJob()
      if (active?.id !== blockId || active.kind !== "block") return
      const parts = blockPartsRef.current.get(blockId) ?? []
      if (parts.length > 0) return
      tryCompleteBlock(blockId)
    },
    [getActiveJob, tryCompleteBlock]
  )

  const reportTextPartDisplay = useCallback(
    (partId: string, visibleLength: number) => {
      const prev = partVisibleLengthRef.current.get(partId) ?? 0
      if (prev === visibleLength) return
      partVisibleLengthRef.current.set(partId, visibleLength)
      if ((prev === 0 && visibleLength > 0) || (prev > 0 && visibleLength === 0)) {
        bumpQueue()
      }
    },
    [bumpQueue]
  )

  const getTextPartVisibleLength = useCallback((partId: string) => {
    return partVisibleLengthRef.current.get(partId) ?? 0
  }, [])

  const getBlockTextPartIds = useCallback((blockId: string) => {
    return blockPartsRef.current.get(blockId) ?? []
  }, [])

  const value = useMemo(
    () => ({
      isStreaming,
      queueVersion,
      registerBlock,
      registerTextPart,
      isBlockRevealed,
      isTextPartActive,
      isTextPartComplete,
      shouldSkipTyping,
      markTextPartComplete,
      reopenTextPart,
      getPartGeneration,
      tryCompleteEmptyBlock,
      reportTextPartDisplay,
      getTextPartVisibleLength,
      getBlockTextPartIds,
    }),
    [
      isStreaming,
      queueVersion,
      registerBlock,
      registerTextPart,
      isBlockRevealed,
      isTextPartActive,
      isTextPartComplete,
      shouldSkipTyping,
      markTextPartComplete,
      reopenTextPart,
      getPartGeneration,
      tryCompleteEmptyBlock,
      reportTextPartDisplay,
      getTextPartVisibleLength,
      getBlockTextPartIds,
    ]
  )

  return (
    <AgentMessageBoardTextContext.Provider value={value}>
      {children}
    </AgentMessageBoardTextContext.Provider>
  )
}
