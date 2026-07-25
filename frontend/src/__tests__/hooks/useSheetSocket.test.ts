import { act, renderHook } from '@testing-library/react';
import { useSheetSocket } from '@/hooks/useSheetSocket';
import { useAuthStore } from '@/lib/authStore';
import { useSheetSocketStore } from '@/lib/sheetSocketStore';

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readonly url: string;
  readyState = MockWebSocket.CONNECTING;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  send(data: string) {
    this.sent.push(data);
  }

  close = jest.fn((code = 1000) => {
    if (this.readyState === MockWebSocket.CLOSED) return;
    this.readyState = MockWebSocket.CLOSING;
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code } as CloseEvent);
  });
}

describe('useSheetSocket resume recovery', () => {
  const originalWebSocket = global.WebSocket;
  const originalVisibilityState = Object.getOwnPropertyDescriptor(document, 'visibilityState');
  let visibilityState: DocumentVisibilityState = 'visible';

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-25T00:00:00Z'));
    MockWebSocket.instances = [];
    visibilityState = 'visible';
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibilityState,
    });
    global.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    delete (window as typeof window & { __sheetCollabClientId?: string }).__sheetCollabClientId;
    window.sessionStorage.clear();
    useAuthStore.setState({ token: 'test-token' });
    useSheetSocketStore.getState().reset();
  });

  afterEach(() => {
    useAuthStore.setState({ token: null, user: null });
    useSheetSocketStore.getState().reset();
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  afterAll(() => {
    global.WebSocket = originalWebSocket;
    if (originalVisibilityState) {
      Object.defineProperty(document, 'visibilityState', originalVisibilityState);
    }
  });

  it('forces a new socket and canonical refresh after a long hidden interval', () => {
    const onRefreshRequired = jest.fn();
    const { unmount } = renderHook(() => useSheetSocket(123, { onRefreshRequired }));
    expect(MockWebSocket.instances).toHaveLength(1);

    act(() => {
      MockWebSocket.instances[0].open();
    });

    act(() => {
      visibilityState = 'hidden';
      document.dispatchEvent(new Event('visibilitychange'));
    });
    jest.setSystemTime(new Date('2026-07-25T00:00:21Z'));
    act(() => {
      visibilityState = 'visible';
      document.dispatchEvent(new Event('visibilitychange'));
      jest.runOnlyPendingTimers();
    });

    expect(MockWebSocket.instances[0].close).toHaveBeenCalledWith(4000, 'client_resume');
    expect(MockWebSocket.instances).toHaveLength(2);

    act(() => {
      MockWebSocket.instances[1].open();
    });
    expect(onRefreshRequired).toHaveBeenCalledWith('reconnected');

    unmount();
  });
});
