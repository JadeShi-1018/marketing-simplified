const STORAGE_KEY = "agent-message-board-read-parts"

type SessionReadState = {
  parts: string[]
  messageIds: string[]
}

type ReadStateStore = {
  sessions: Record<string, SessionReadState | string[]>
}

function normalizeSessionEntry(
  entry: SessionReadState | string[] | undefined
): SessionReadState {
  if (!entry) return { parts: [], messageIds: [] }
  if (Array.isArray(entry)) return { parts: entry, messageIds: [] }
  return {
    parts: Array.isArray(entry.parts) ? entry.parts : [],
    messageIds: Array.isArray(entry.messageIds) ? entry.messageIds : [],
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

function getSessionState(sessionId: string): SessionReadState {
  return normalizeSessionEntry(readStore().sessions[sessionId])
}

function partMatchesQuitMessage(partId: string, messageIds: string[]): boolean {
  return messageIds.some((messageId) => partId.startsWith(`${messageId}-`))
}

export function isAgentMessageBoardTextPartRead(
  sessionId: string,
  partId: string
): boolean {
  const { parts, messageIds } = getSessionState(sessionId)
  if (parts.includes(partId)) return true
  return partMatchesQuitMessage(partId, messageIds)
}

function writeSessionState(sessionId: string, state: SessionReadState): void {
  const store = readStore()
  store.sessions[sessionId] = state
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

/** Mark every message currently on the board as read (user left the message board). */
export function markAgentMessageBoardSessionQuit(
  sessionId: string,
  messageIds: Iterable<string>,
  extraPartIds: Iterable<string> = []
): void {
  const state = getSessionState(sessionId)
  const parts = new Set(state.parts)
  const ids = new Set(state.messageIds)
  let changed = false

  for (const messageId of messageIds) {
    if (!ids.has(messageId)) {
      ids.add(messageId)
      changed = true
    }
  }
  for (const partId of extraPartIds) {
    if (!parts.has(partId)) {
      parts.add(partId)
      changed = true
    }
  }
  if (!changed) return
  writeSessionState(sessionId, { parts: [...parts], messageIds: [...ids] })
}
