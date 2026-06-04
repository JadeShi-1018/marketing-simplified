const STORAGE_KEY = "agent-message-board-read-parts"

export type PartProgress = {
  visibleLength: number
  complete?: boolean
}

export type SessionRenderSnapshot = {
  completedJobIds: string[]
  blockPartsCompleted: Record<string, string[]>
  partProgress: Record<string, PartProgress>
}

type SessionReadState = {
  parts: string[]
  messageIds?: string[]
  snapshot?: SessionRenderSnapshot
  backendResponseWaiting?: boolean
  renderFinish?: boolean
  thinkingBubbleShowUp?: boolean
  waitingForFileAnalysisResponse?: boolean
  renderEffectsCompletedOnQuit?: boolean
}

type ReadStateStore = {
  sessions: Record<string, SessionReadState | string[]>
}

function normalizeSessionEntry(
  entry: SessionReadState | string[] | undefined
): SessionReadState {
  if (!entry) return { parts: [] }
  if (Array.isArray(entry)) return { parts: entry }
  const backendResponseWaiting = Boolean(
    entry.backendResponseWaiting ?? entry.waitingForFileAnalysisResponse
  )
  const renderFinish = Boolean(
    entry.renderFinish ?? entry.renderEffectsCompletedOnQuit
  )
  const thinkingBubbleShowUp = Boolean(
    entry.thinkingBubbleShowUp ?? (backendResponseWaiting && renderFinish)
  )
  return {
    parts: Array.isArray(entry.parts) ? entry.parts : [],
    messageIds: Array.isArray(entry.messageIds) ? entry.messageIds : undefined,
    snapshot: entry.snapshot,
    backendResponseWaiting,
    renderFinish,
    thinkingBubbleShowUp,
    waitingForFileAnalysisResponse: backendResponseWaiting,
    renderEffectsCompletedOnQuit: renderFinish,
  }
}

function readStore(): ReadStateStore {
  if (typeof window === "undefined") return { sessions: {} }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { sessions: {} }
    const parsed = JSON.parse(raw) as ReadStateStore
    if (!parsed || typeof parsed !== "object" || !parsed.sessions) {
      return { sessions: {} }
    }
    return parsed
  } catch {
    return { sessions: {} }
  }
}

function writeStore(store: ReadStateStore): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // Ignore quota / private-mode failures.
  }
}

function sessionKey(sessionId: string): string {
  return String(sessionId)
}

function mergePartProgress(
  prev: Record<string, PartProgress> | undefined,
  next: Record<string, PartProgress>
): Record<string, PartProgress> {
  const merged: Record<string, PartProgress> = { ...prev }
  for (const [partId, progress] of Object.entries(next)) {
    const existing = merged[partId]
    if (!existing) {
      merged[partId] = progress
      continue
    }
    merged[partId] = {
      visibleLength: Math.max(existing.visibleLength ?? 0, progress.visibleLength ?? 0),
      complete: Boolean(existing.complete || progress.complete),
    }
  }
  return merged
}

function getSessionState(sessionId: string): SessionReadState {
  return normalizeSessionEntry(readStore().sessions[sessionKey(sessionId)])
}

function withThinkingBubbleShowUp(state: SessionReadState): SessionReadState {
  const backendResponseWaiting = Boolean(
    state.backendResponseWaiting ?? state.waitingForFileAnalysisResponse
  )
  const renderFinish = Boolean(
    state.renderFinish ?? state.renderEffectsCompletedOnQuit
  )
  const thinkingBubbleShowUp = backendResponseWaiting && renderFinish
  return {
    ...state,
    backendResponseWaiting,
    renderFinish,
    thinkingBubbleShowUp,
    waitingForFileAnalysisResponse: backendResponseWaiting,
    renderEffectsCompletedOnQuit: renderFinish,
  }
}

export function snapshotHasProgress(snapshot: SessionRenderSnapshot): boolean {
  if (snapshot.completedJobIds.length > 0) return true
  for (const partIds of Object.values(snapshot.blockPartsCompleted)) {
    if (partIds.length > 0) return true
  }
  return Object.keys(snapshot.partProgress).length > 0
}

function partMatchesQuitMessage(partId: string, messageIds: string[]): boolean {
  return messageIds.some((messageId) => partId.startsWith(`${messageId}-`))
}

/** True when the part finished typing or was explicitly marked read. */
export function isAgentMessageBoardTextPartFullyRead(
  sessionId: string,
  partId: string
): boolean {
  const { parts } = getSessionState(sessionId)
  return parts.includes(partId)
}

/**
 * True when the part should skip typing animation (fully read, or legacy quit snapshot).
 * @deprecated Prefer isAgentMessageBoardTextPartFullyRead for new code.
 */
export function isAgentMessageBoardTextPartRead(
  sessionId: string,
  partId: string
): boolean {
  if (isAgentMessageBoardTextPartFullyRead(sessionId, partId)) return true
  const { messageIds, snapshot } = getSessionState(sessionId)
  if (snapshot) return false
  if (messageIds?.length) {
    return partMatchesQuitMessage(partId, messageIds)
  }
  return false
}

function writeSessionState(sessionId: string, state: SessionReadState): void {
  const store = readStore()
  store.sessions[sessionKey(sessionId)] = withThinkingBubbleShowUp(state)
  writeStore(store)
}

export function markAgentMessageBoardTextPartRead(
  sessionId: string,
  partId: string
): void {
  const state = getSessionState(sessionId)
  if (state.parts.includes(partId)) return
  writeSessionState(sessionId, {
    ...state,
    parts: [...state.parts, partId],
  })
}

export function markAgentMessageBoardTextPartsRead(
  sessionId: string,
  partIds: Iterable<string>
): void {
  const state = getSessionState(sessionId)
  const parts = new Set(state.parts)
  let changed = false
  for (const partId of partIds) {
    if (!parts.has(partId)) {
      parts.add(partId)
      changed = true
    }
  }
  if (!changed) return
  writeSessionState(sessionId, { ...state, parts: [...parts] })
}

export function loadAgentMessageBoardRenderSnapshot(
  sessionId: string
): SessionRenderSnapshot | null {
  const { snapshot } = getSessionState(sessionId)
  if (!snapshot) return null
  return {
    completedJobIds: Array.isArray(snapshot.completedJobIds)
      ? snapshot.completedJobIds
      : [],
    blockPartsCompleted:
      snapshot.blockPartsCompleted && typeof snapshot.blockPartsCompleted === "object"
        ? snapshot.blockPartsCompleted
        : {},
    partProgress:
      snapshot.partProgress && typeof snapshot.partProgress === "object"
        ? snapshot.partProgress
        : {},
  }
}

export function saveAgentMessageBoardRenderSnapshot(
  sessionId: string,
  snapshot: SessionRenderSnapshot,
  extraPartIds: Iterable<string> = []
): void {
  const state = getSessionState(sessionId)
  const parts = new Set(state.parts)
  let changed = false

  for (const partId of extraPartIds) {
    if (!parts.has(partId)) {
      parts.add(partId)
      changed = true
    }
  }

  const prevSnapshot = state.snapshot
  const snapshotChanged =
    !prevSnapshot ||
    JSON.stringify(prevSnapshot) !== JSON.stringify(snapshot)

  if (
    prevSnapshot &&
    snapshotHasProgress(prevSnapshot) &&
    !snapshotHasProgress(snapshot)
  ) {
    return
  }

  const mergedSnapshot: SessionRenderSnapshot = {
    completedJobIds: [
      ...new Set([
        ...(prevSnapshot?.completedJobIds ?? []),
        ...snapshot.completedJobIds,
      ]),
    ],
    blockPartsCompleted: { ...prevSnapshot?.blockPartsCompleted },
    partProgress: mergePartProgress(prevSnapshot?.partProgress, snapshot.partProgress),
  }
  for (const [blockId, partIds] of Object.entries(snapshot.blockPartsCompleted)) {
    const prev = mergedSnapshot.blockPartsCompleted[blockId] ?? []
    mergedSnapshot.blockPartsCompleted[blockId] = [
      ...new Set([...prev, ...partIds]),
    ]
  }

  const mergedChanged =
    !prevSnapshot ||
    JSON.stringify(prevSnapshot) !== JSON.stringify(mergedSnapshot)

  if (!changed && !mergedChanged) return

  writeSessionState(sessionId, {
    ...state,
    parts: [...parts],
    snapshot: mergedSnapshot,
  })
}

export function getAgentMessageBoardPartResumeLength(
  sessionId: string,
  partId: string
): number {
  if (isAgentMessageBoardTextPartFullyRead(sessionId, partId)) return 0
  const { snapshot } = getSessionState(sessionId)
  if (!snapshot?.partProgress) return 0
  const progress = snapshot.partProgress[partId]
  if (!progress || progress.complete) return 0
  const len = progress.visibleLength
  return typeof len === "number" && len > 0 ? len : 0
}

/** Persist render progress when the user leaves a session (no blanket message read). */
export function markAgentMessageBoardSessionQuit(
  sessionId: string,
  snapshot: SessionRenderSnapshot,
  extraPartIds: Iterable<string> = []
): void {
  saveAgentMessageBoardRenderSnapshot(sessionId, snapshot, extraPartIds)
}

export function setAgentMessageBoardWaitingForFileAnalysisResponse(
  sessionId: string,
  waiting: boolean
): void {
  const state = getSessionState(sessionId)
  if (Boolean(state.backendResponseWaiting) === waiting) return
  writeSessionState(sessionId, {
    ...state,
    backendResponseWaiting: waiting,
    waitingForFileAnalysisResponse: waiting,
  })
}

export function isAgentMessageBoardWaitingForFileAnalysisResponse(
  sessionId: string
): boolean {
  return Boolean(getSessionState(sessionId).backendResponseWaiting)
}

export function setAgentMessageBoardRenderEffectsCompletedOnQuit(
  sessionId: string,
  completed: boolean
): void {
  const state = getSessionState(sessionId)
  if (Boolean(state.renderFinish) === completed) return
  writeSessionState(sessionId, {
    ...state,
    renderFinish: completed,
    renderEffectsCompletedOnQuit: completed,
  })
}

export function isAgentMessageBoardRenderEffectsCompletedOnQuit(
  sessionId: string
): boolean {
  return Boolean(getSessionState(sessionId).renderFinish)
}

export function shouldShowAgentMessageBoardThinkingBubbleOnRevisit(
  sessionId: string
): boolean {
  const state = getSessionState(sessionId)
  return Boolean(state.thinkingBubbleShowUp)
}
