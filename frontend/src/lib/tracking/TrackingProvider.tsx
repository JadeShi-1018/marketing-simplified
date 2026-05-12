'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useAuthStore } from '../authStore';
import * as trackingApi from './api';
import { canKeepalive } from './capabilities';
import type { EventMetadata, EventType, TrackingConfig, TrackingEventPayload } from './types';

const SESSION_KEY = 'tracking_session_id';
const MAX_QUEUE = 100;
const THROTTLE_MS = 1000;

export interface TrackingTarget {
  contentType: string;
  objectId: number;
  projectId?: number | null;
}

export interface TrackingContextValue {
  sessionId: string | null;
  emit: (type: EventType, target?: TrackingTarget, metadata?: EventMetadata) => void;
  setActiveTarget: (target: TrackingTarget | null) => void;
}

const TrackingContext = createContext<TrackingContextValue>({
  sessionId: null,
  emit: () => {},
  setActiveTarget: () => {},
});

export function useTracking(): TrackingContextValue {
  return useContext(TrackingContext);
}

export function TrackingProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [sessionId, setSessionId] = useState<string | null>(() =>
    typeof window !== 'undefined' ? sessionStorage.getItem(SESSION_KEY) : null,
  );

  const sessionIdRef = useRef<string | null>(sessionId);
  const configRef = useRef<TrackingConfig | null>(null);
  const queueRef = useRef<TrackingEventPayload[]>([]);
  const activeTargetRef = useRef<TrackingTarget | null>(null);

  // Idle tracking
  const lastActivityRef = useRef<number>(Date.now());
  const isIdleRef = useRef<boolean>(false);
  const idleStartRef = useRef<number | null>(null);

  // Active-seconds accumulation for heartbeat delta
  const activeSecondsRef = useRef<number>(0);

  // Timer handles — stored in refs so the async init can set them and cleanup can clear them
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activityTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep ref in sync so async callbacks always see the latest sessionId
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  const setActiveTarget = useCallback((target: TrackingTarget | null) => {
    activeTargetRef.current = target;
  }, []);

  const emit = useCallback(
    (type: EventType, target?: TrackingTarget, metadata?: EventMetadata) => {
      const t = target ?? activeTargetRef.current;
      if (!t) return;

      const event: TrackingEventPayload = {
        client_event_id: crypto.randomUUID(),
        event_type: type,
        occurred_at: new Date().toISOString(),
        content_type: t.contentType,
        object_id: t.objectId,
        project_id: t.projectId,
        metadata,
      };

      queueRef.current.push(event);
      if (queueRef.current.length > MAX_QUEUE) {
        queueRef.current = queueRef.current.slice(-MAX_QUEUE);
      }
    },
    [],
  );

  const flushEvents = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid || queueRef.current.length === 0) return;

    const batch = queueRef.current.splice(0, 100);
    try {
      await trackingApi.sendEvents(sid, batch);
    } catch {
      // Prepend back, cap at MAX_QUEUE to prevent unbounded growth
      queueRef.current = [...batch, ...queueRef.current].slice(0, MAX_QUEUE);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;

    // Throttled activity handler — defined before cleanup so cleanup can deregister it
    let lastThrottle = 0;
    function onActivity() {
      const now = Date.now();
      if (now - lastThrottle < THROTTLE_MS) return;
      lastThrottle = now;
      lastActivityRef.current = now;

      // Transition idle → active
      if (isIdleRef.current) {
        const idleDuration = idleStartRef.current
          ? Math.round((now - idleStartRef.current) / 1000)
          : undefined;
        isIdleRef.current = false;
        idleStartRef.current = null;
        emit('IDLE_END', undefined, { idle_duration_seconds: idleDuration });
      }

      // Reset idle countdown
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      const idleMs = (configRef.current?.idle_seconds ?? 120) * 1000;
      idleTimerRef.current = setTimeout(() => {
        if (cancelled) return;
        isIdleRef.current = true;
        idleStartRef.current = Date.now();
        emit('IDLE_START', undefined, { trigger: 'timeout' });
      }, idleMs);
    }

    function onBeforeUnload() {
      if (!canKeepalive) return;
      const sid = sessionIdRef.current;
      if (!sid) return;
      const delta = Math.round(activeSecondsRef.current);
      activeSecondsRef.current = 0;
      trackingApi.endSession(sid, delta, true);
    }

    // pagehide fires on mobile and on bfcache navigations — cover both
    const onPageHide = onBeforeUnload;

    function cleanup() {
      cancelled = true;
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      if (flushTimerRef.current) clearInterval(flushTimerRef.current);
      if (activityTickRef.current) clearInterval(activityTickRef.current);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      document.removeEventListener('mousemove', onActivity);
      document.removeEventListener('keydown', onActivity);
      document.removeEventListener('click', onActivity);
      document.removeEventListener('scroll', onActivity, true);
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('pagehide', onPageHide);
    }

    async function init() {
      try {
        const config = await trackingApi.getConfig();
        if (cancelled) return;
        configRef.current = config;

        // Restore session from sessionStorage or create a new one
        let sid = sessionStorage.getItem(SESSION_KEY);
        if (!sid) {
          const res = await trackingApi.createSession(navigator.userAgent);
          if (cancelled) return;
          sid = res.session_id;
          sessionStorage.setItem(SESSION_KEY, sid);
        }
        setSessionId(sid);
        sessionIdRef.current = sid;

        // Reset active-time accumulator for this session start
        activeSecondsRef.current = 0;
        lastActivityRef.current = Date.now();

        // Heartbeat: every heartbeat_seconds, send accumulated active time
        heartbeatTimerRef.current = setInterval(async () => {
          const currentSid = sessionIdRef.current;
          if (!currentSid) return;
          const delta = Math.round(activeSecondsRef.current);
          activeSecondsRef.current = 0;
          if (delta > 0) {
            try {
              await trackingApi.heartbeat(currentSid, delta);
            } catch {
              // Session may have expired server-side; ignore
            }
          }
        }, config.heartbeat_seconds * 1000);

        // 1-second tick: accumulate active seconds when not idle
        activityTickRef.current = setInterval(() => {
          const idleMs = (configRef.current?.idle_seconds ?? 120) * 1000;
          if (Date.now() - lastActivityRef.current < idleMs) {
            activeSecondsRef.current += 1;
          }
        }, 1000);

        // Event flush
        flushTimerRef.current = setInterval(flushEvents, config.event_flush_seconds * 1000);

        // Start idle countdown from now
        idleTimerRef.current = setTimeout(() => {
          if (cancelled) return;
          isIdleRef.current = true;
          idleStartRef.current = Date.now();
          emit('IDLE_START', undefined, { trigger: 'timeout' });
        }, config.idle_seconds * 1000);

        // Activity listeners
        document.addEventListener('mousemove', onActivity, { passive: true });
        document.addEventListener('keydown', onActivity, { passive: true });
        document.addEventListener('click', onActivity, { passive: true });
        document.addEventListener('scroll', onActivity, { passive: true, capture: true });

        // Unload listeners
        window.addEventListener('beforeunload', onBeforeUnload);
        window.addEventListener('pagehide', onPageHide);
      } catch (e) {
        console.error('[TrackingProvider] init failed:', e);
      }
    }

    init();
    return cleanup;
  }, [isAuthenticated, emit, flushEvents]);

  return (
    <TrackingContext.Provider value={{ sessionId, emit, setActiveTarget }}>
      {children}
    </TrackingContext.Provider>
  );
}
