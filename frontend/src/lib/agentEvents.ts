/**
 * Agent-related custom events for cross-component communication
 */

export const AGENT_EVENTS = {
  SESSIONS_CHANGED: 'agent:sessions-changed',
} as const

export const dispatchSessionsChanged = () => {
  window.dispatchEvent(new CustomEvent(AGENT_EVENTS.SESSIONS_CHANGED))
}
