import {
  AGENT_CALENDAR_CONTEXT_KEY,
  AGENT_SESSION_ID_KEY,
  consumeCalendarPreload,
  readStoredAgentSessionId,
} from '@/lib/agentLaunchContext';

describe('agentLaunchContext', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('returns null when no calendar context is staged', () => {
    expect(consumeCalendarPreload()).toBeNull();
  });

  it('consumes calendar view context and removes it from sessionStorage', () => {
    sessionStorage.setItem(
      AGENT_CALENDAR_CONTEXT_KEY,
      JSON.stringify({ type: 'calendar', currentView: 'week' })
    );

    const preload = consumeCalendarPreload();

    expect(preload).not.toBeNull();
    expect(preload?.message).toContain('week');
    expect(preload?.message).toContain('calendar');
    expect(sessionStorage.getItem(AGENT_CALENDAR_CONTEXT_KEY)).toBeNull();
    expect(consumeCalendarPreload()).toBeNull();
  });

  it('consumes calendar event context with title and description', () => {
    sessionStorage.setItem(
      AGENT_CALENDAR_CONTEXT_KEY,
      JSON.stringify({
        type: 'event',
        eventTitle: 'Launch review',
        startDatetime: '2026-07-08T09:00:00Z',
        endDatetime: '2026-07-08T10:00:00Z',
        description: 'Final QA',
      })
    );

    const preload = consumeCalendarPreload();

    expect(preload?.message).toContain('Launch review');
    expect(preload?.message).toContain('Final QA');
    expect(preload?.context.type).toBe('event');
  });

  it('reads stored agent session id', () => {
    sessionStorage.setItem(AGENT_SESSION_ID_KEY, '  session-42  ');
    expect(readStoredAgentSessionId()).toBe('session-42');
  });
});
