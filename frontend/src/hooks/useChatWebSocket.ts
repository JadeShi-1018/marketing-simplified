'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { buildWsUrl } from '@/lib/ws';
import { useAuthStore } from '@/lib/authStore';

// WebSocket message types (server -> client)
export type ChatWsEventType =
  | 'chat_message'
  | 'typing_indicator'
  | 'message_status_update'
  | 'reaction_update'
  | 'in_app_notification'
  | 'error'
  | 'pong'
  | string;

export interface ChatWsEvent<T = any> {
  type: ChatWsEventType;
  payload?: T;
  // Specific fields for different event types
  chat_id?: number;
  user_id?: number;
  is_typing?: boolean;
  message?: any;
  message_id?: number;
  status?: string;
  reaction?: any;
  notification?: any;
  timestamp?: string;
}

export interface UseChatWebSocketHandlers {
  onChatMessage?: (e: ChatWsEvent) => void;
  onTypingIndicator?: (e: ChatWsEvent) => void;
  onMessageStatusUpdate?: (e: ChatWsEvent) => void;
  onReactionUpdate?: (e: ChatWsEvent) => void;
  onInAppNotification?: (e: ChatWsEvent) => void;
  onError?: (e: ChatWsEvent) => void;
  onUnknownEvent?: (e: ChatWsEvent) => void;
  onOpen?: () => void;
  onClose?: (ev: CloseEvent) => void;
  onConnectionError?: (ev: Event) => void;
}

/**
 * WebSocket hook for real-time chat functionality.
 * Connects to /ws/chat/{user_id}/ and handles chat events.
 */
export function useChatWebSocket(
  userId: number | null | undefined,
  handlers: UseChatWebSocketHandlers = {}
) {
  const { token } = useAuthStore();
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const retryRef = useRef(0);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const shouldRun = useMemo(() => !!userId, [userId]);

  useEffect(() => {
    if (!shouldRun) return;

    let stopped = false;

    const connect = () => {
      if (stopped) return;

      const url = buildWsUrl(`/ws/chat/${userId}/`, token ? { token } : undefined);
      console.log('🔌 Chat WebSocket connecting to:', url);
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[ChatWS] Connected');
        setConnected(true);
        retryRef.current = 0;
        handlers.onOpen?.();

        // Start heartbeat every 30 seconds to keep connection alive
        heartbeatIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'heartbeat' }));
          }
        }, 30000);
      };

      ws.onmessage = (ev) => {
        try {
          const data: ChatWsEvent = JSON.parse(ev.data);
          console.log('[ChatWS] event', data);

          switch (data.type) {
            case 'chat_message':
              handlers.onChatMessage?.(data);
              break;
            case 'typing_indicator':
              handlers.onTypingIndicator?.(data);
              break;
            case 'message_status_update':
              handlers.onMessageStatusUpdate?.(data);
              break;
            case 'reaction_update':
              handlers.onReactionUpdate?.(data);
              break;
            case 'in_app_notification':
              handlers.onInAppNotification?.(data);
              break;
            case 'error':
              handlers.onError?.(data);
              break;
            case 'pong':
              // Heartbeat response, ignore
              break;
            default:
              handlers.onUnknownEvent?.(data);
          }
        } catch (e) {
          console.warn('[ChatWS] message parse error', e);
        }
      };

      ws.onerror = (ev) => {
        console.error('[ChatWS] error', ev);
        handlers.onConnectionError?.(ev);
      };

      ws.onclose = (ev) => {
        console.warn('[ChatWS] close', { code: ev.code, reason: ev.reason });
        setConnected(false);
        handlers.onClose?.(ev);
        wsRef.current = null;

        // Clear heartbeat
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }

        // Reconnect with exponential backoff
        if (!stopped) {
          const retry = Math.min(1000 * Math.pow(2, retryRef.current++), 10000);
          console.log(`[ChatWS] Reconnecting in ${retry}ms...`);
          setTimeout(connect, retry);
        }
      };
    };

    connect();

    return () => {
      stopped = true;
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldRun, userId, token]);

  /**
   * Send typing start event
   */
  const sendTypingStart = (chatId: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'typing_start',
          chat_id: chatId,
        })
      );
    }
  };

  /**
   * Send typing stop event
   */
  const sendTypingStop = (chatId: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'typing_stop',
          chat_id: chatId,
        })
      );
    }
  };

  return {
    connected,
    sendTypingStart,
    sendTypingStop,
  };
}
