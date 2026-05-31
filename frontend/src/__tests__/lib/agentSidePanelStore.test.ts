import {
  AGENT_PANEL_OPENED_EVENT,
  AGENT_SESSION_ID_KEY,
} from '@/lib/agentLaunchContext';
import {
  openAgentSidePanel,
  useAgentSidePanelStore,
} from '@/lib/agentSidePanelStore';

describe('openAgentSidePanel', () => {
  beforeEach(() => {
    sessionStorage.clear();
    useAgentSidePanelStore.setState({ isOpen: false });
  });

  it('opens the side panel store', () => {
    openAgentSidePanel();
    expect(useAgentSidePanelStore.getState().isOpen).toBe(true);
  });

  it('dispatches panel-opened and load-session when session id is staged', () => {
    sessionStorage.setItem(AGENT_SESSION_ID_KEY, 'decision-session-9');

    const panelOpened = jest.fn();
    const loadSession = jest.fn();
    window.addEventListener(AGENT_PANEL_OPENED_EVENT, panelOpened);
    window.addEventListener('agent:load-session', loadSession);

    openAgentSidePanel();

    expect(panelOpened).toHaveBeenCalledTimes(1);
    expect(loadSession).toHaveBeenCalledTimes(1);
    expect((loadSession.mock.calls[0][0] as CustomEvent).detail).toEqual({
      sessionId: 'decision-session-9',
    });

    window.removeEventListener(AGENT_PANEL_OPENED_EVENT, panelOpened);
    window.removeEventListener('agent:load-session', loadSession);
  });

  it('dispatches panel-opened only when no session id is staged', () => {
    const panelOpened = jest.fn();
    const loadSession = jest.fn();
    window.addEventListener(AGENT_PANEL_OPENED_EVENT, panelOpened);
    window.addEventListener('agent:load-session', loadSession);

    openAgentSidePanel();

    expect(panelOpened).toHaveBeenCalledTimes(1);
    expect(loadSession).not.toHaveBeenCalled();

    window.removeEventListener(AGENT_PANEL_OPENED_EVENT, panelOpened);
    window.removeEventListener('agent:load-session', loadSession);
  });
});
