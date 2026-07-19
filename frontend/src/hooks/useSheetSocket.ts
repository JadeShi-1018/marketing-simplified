'use client';

import { useEffect, useMemo, useRef } from 'react';
import { buildWsUrl } from '@/lib/ws';
import { useAuthStore } from '@/lib/authStore';
import {
  selectRemotePresenceUsers,
  useSheetSocketStore,
  type SheetPresenceCursor,
  type SheetPresenceUser,
  type SheetWsState,
} from '@/lib/sheetSocketStore';

export type SheetCursorPayload = {
  row: number;
  col: number;
  start_row: number;
  end_row: number;
  start_col: number;
  end_col: number;
  is_active: boolean;
};

type Api = {
  wsState: SheetWsState;
  closeCode: number | null;
  clientId: string;
  remoteUsers: SheetPresenceUser[];
  sendCursorUpdate: (payload: SheetCursorPayload) => boolean;
};

const RECONNECT_DELAY_MS = 1500;

function createClientId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `sheet_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function useSheetSocket(sheetId: number | null | undefined): Api {
  const token = useAuthStore((s) => s.token);
  const rawLocalUserId = useAuthStore((s) => s.user?.id ?? null);
  const parsedLocalUserId = rawLocalUserId == null ? null : Number(rawLocalUserId);
  const localUserId =
    parsedLocalUserId != null && Number.isFinite(parsedLocalUserId) ? parsedLocalUserId : null;
  const clientIdRef = useRef<string>(createClientId());
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const localUserIdRef = useRef(localUserId);
  localUserIdRef.current = localUserId;

  const wsState = useSheetSocketStore((s) => s.wsState);
  const closeCode = useSheetSocketStore((s) => s.closeCode);
  const usersByKey = useSheetSocketStore((s) => s.usersByKey);

  const remoteUsers = useMemo(
    () => selectRemotePresenceUsers(usersByKey, localUserId, clientIdRef.current),
    [usersByKey, localUserId]
  );

  useEffect(() => {
    if (!sheetId || !token) {
      useSheetSocketStore.getState().reset();
      return;
    }

    let stopped = false;
    const createdSockets: WebSocket[] = [];
    useSheetSocketStore.getState().setSheetId(sheetId);
    useSheetSocketStore.getState().setWsState('connecting');
    useSheetSocketStore.getState().setCloseCode(null);

    const connect = () => {
      if (stopped) return;
      const url = buildWsUrl(`/ws/spreadsheets/sheets/${sheetId}/`, {
        token,
        client_id: clientIdRef.current,
      });
      const prev = useSheetSocketStore.getState().wsState;
      useSheetSocketStore
        .getState()
        .setWsState(prev === 'connected' || prev === 'reconnecting' ? 'reconnecting' : 'connecting');

      const ws = new WebSocket(url);
      createdSockets.push(ws);
      wsRef.current = ws;

      ws.onopen = () => {
        if (stopped) return;
        useSheetSocketStore.getState().setWsState('connected');
        useSheetSocketStore.getState().setCloseCode(null);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (!message || typeof message.type !== 'string') return;
          const s = useSheetSocketStore.getState();
          if (message.type === 'presence_snapshot') {
            s.applySnapshot(Array.isArray(message.users) ? message.users : []);
          } else if (message.type === 'presence_join') {
            s.applyJoin(message);
          } else if (message.type === 'presence_leave') {
            s.applyLeave(message);
          } else if (message.type === 'cursor_updated') {
            if (
              message.client_id &&
              message.client_id === clientIdRef.current &&
              message.user_id === localUserIdRef.current
            ) {
              return;
            }
            s.applyCursor(message);
          }
        } catch {
          /* ignore malformed frames */
        }
      };

      ws.onclose = (ev) => {
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
        useSheetSocketStore.getState().setCloseCode(ev.code);
        if (stopped) {
          useSheetSocketStore.getState().setWsState('closed');
          return;
        }
        if (ev.code === 4001 || ev.code === 4003) {
          useSheetSocketStore.getState().setWsState('closed');
          return;
        }
        useSheetSocketStore.getState().setWsState('reconnecting');
        if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = window.setTimeout(connect, RECONNECT_DELAY_MS);
      };

      ws.onerror = () => {
        /* onclose will fire */
      };
    };

    connect();

    return () => {
      stopped = true;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      createdSockets.forEach((sock) => {
        try {
          sock.close();
        } catch {
          /* ignore */
        }
      });
      wsRef.current = null;
      useSheetSocketStore.getState().reset();
    };
  }, [sheetId, token]);

  const sendCursorUpdate = (payload: SheetCursorPayload): boolean => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    try {
      ws.send(
        JSON.stringify({
          type: 'cursor_update',
          ...payload,
          client_id: clientIdRef.current,
        })
      );
      return true;
    } catch {
      return false;
    }
  };

  return {
    wsState,
    closeCode,
    clientId: clientIdRef.current,
    remoteUsers,
    sendCursorUpdate,
  };
}

export type { SheetPresenceCursor, SheetPresenceUser, SheetWsState };
