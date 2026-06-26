import {
  AGENT_CALENDAR_CONTEXT_KEY,
  AGENT_SESSION_ID_KEY,
  consumeCalendarPreload,
  consumeDraftPreload,
  readStoredAgentSessionId,
  shouldAutoSendDraftPreload,
  stageDraftContext,
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

describe('agentLaunchContext — draft entry points', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('"Ask Agent" (list) stages an auto-send "Summarize this draft." message', () => {
    stageDraftContext({ draftId: 'q3-plan', title: 'Q3 Plan', autoSend: true });
    const preload = consumeDraftPreload();
    expect(preload).not.toBeNull();
    expect(preload?.autoSend).toBe(true);
    expect(preload?.message).toBe('Summarize this draft.');
    expect(preload?.context.draftId).toBe('q3-plan');
    expect(shouldAutoSendDraftPreload(preload)).toBe(true);
  });

  it('"Open in Agent" (editor) attaches context but does NOT auto-send', () => {
    stageDraftContext({ draftId: 'q3-plan', title: 'Q3 Plan', autoSend: false });
    const preload = consumeDraftPreload();
    expect(preload).not.toBeNull();
    expect(preload?.autoSend).toBe(false);
    expect(preload?.message).toBe('');
    // The agent must stay silent (no LLM call) until the user sends a message.
    expect(shouldAutoSendDraftPreload(preload)).toBe(false);
    // ...but the draft is still attached for whatever the user sends next.
    expect(preload?.context.draftId).toBe('q3-plan');
  });

  it('defaults to auto-send when the flag is omitted', () => {
    stageDraftContext({ draftId: 'x' });
    expect(consumeDraftPreload()?.autoSend).toBe(true);
  });

  it('consuming clears the staged draft context', () => {
    stageDraftContext({ draftId: 'x', autoSend: false });
    expect(consumeDraftPreload()).not.toBeNull();
    expect(consumeDraftPreload()).toBeNull();
  });

  it('shouldAutoSendDraftPreload is false for null', () => {
    expect(shouldAutoSendDraftPreload(null)).toBe(false);
  });
});
