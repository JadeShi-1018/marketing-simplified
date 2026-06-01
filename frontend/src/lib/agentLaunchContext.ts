/** SessionStorage keys and launch helpers for Dashboard Agent side panel. */

export const AGENT_CALENDAR_CONTEXT_KEY = 'agent-calendar-context';
export const AGENT_SESSION_ID_KEY = 'agent-session-id';
export const AGENT_PANEL_OPENED_EVENT = 'agent:panel-opened';

export type CalendarPreload = {
  message: string;
  context: Record<string, unknown>;
};

/**
 * Read and remove calendar/event context staged by Calendar → Ask Agent.
 * Returns null when no context is pending.
 */
export function consumeCalendarPreload(): CalendarPreload | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const raw = sessionStorage.getItem(AGENT_CALENDAR_CONTEXT_KEY);
  if (!raw) {
    return null;
  }
  sessionStorage.removeItem(AGENT_CALENDAR_CONTEXT_KEY);
  try {
    const ctx = JSON.parse(raw) as Record<string, unknown>;
    let message: string;
    if (ctx.type === 'event') {
      const start = new Date(String(ctx.startDatetime));
      const end = new Date(String(ctx.endDatetime));
      const dateStr = start.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      });
      const startTime = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const endTime = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const description =
        typeof ctx.description === 'string' && ctx.description.trim()
          ? ` Description: ${ctx.description.trim()}.`
          : '';
      message = `I'm looking at a calendar event: "${ctx.eventTitle}" on ${dateStr} from ${startTime} to ${endTime}.${description} Can you help me understand this event and suggest what I should prepare or do?`;
    } else {
      message = `I'm viewing my calendar (${(ctx.currentView as string) ?? 'week'} view). Can you help me understand my calendar events, check my availability, or assist with scheduling?`;
    }
    return { message, context: ctx };
  } catch {
    return null;
  }
}

export function readStoredAgentSessionId(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const stored = sessionStorage.getItem(AGENT_SESSION_ID_KEY);
  return stored?.trim() || null;
}
