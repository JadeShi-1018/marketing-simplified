"use client";

/**
 * Orchestrates focus-session lifecycle + periodic signal upload.
 *
 * - Creates a FocusSession when taskId + userId are present.
 * - Every REPORT_INTERVAL_MS, snapshots useFocusSignals counters and POSTs
 *   them to the backend (with retry buffer capped at MAX_PENDING_WINDOWS).
 * - On tab hide: flush immediately.
 * - On page unload: best-effort flush + end via fetch(..., { keepalive: true })
 *   so the browser does not cancel the request mid-navigation.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { BehavioralTrackingAPI } from "@/lib/api/behavioralTrackingApi";
import type { BehavioralSignalInput } from "@/types/behavioralTracking";
import { useFocusSignals } from "@/hooks/useFocusSignals";

const REPORT_INTERVAL_MS = 30_000;
const MAX_PENDING_WINDOWS = 5;

const DEFAULT_API_BASE =
  (typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_API_URL?.trim()) ||
  "";

function parseAuthFromStorage(): {
  token: string | null;
  organizationToken: string | null;
  userRole: string | null;
  teamId: string | null;
} {
  if (typeof window === "undefined") {
    return {
      token: null,
      organizationToken: null,
      userRole: null,
      teamId: null,
    };
  }
  const raw = localStorage.getItem("auth-storage");
  if (!raw) {
    return {
      token: null,
      organizationToken: null,
      userRole: null,
      teamId: null,
    };
  }
  try {
    const authData = JSON.parse(raw) as {
      state?: {
        token?: string;
        organizationAccessToken?: string;
        user?: { roles?: string[]; team_id?: number };
      };
    };
    const user = authData.state?.user;
    return {
      token: authData.state?.token ?? null,
      organizationToken: authData.state?.organizationAccessToken ?? null,
      userRole: user?.roles?.[0] ?? null,
      teamId: user?.team_id != null ? String(user.team_id) : null,
    };
  } catch {
    return {
      token: null,
      organizationToken: null,
      userRole: null,
      teamId: null,
    };
  }
}

function buildAuthHeaders(): Record<string, string> {
  const { token, organizationToken, userRole, teamId } =
    parseAuthFromStorage();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/plain, */*",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (organizationToken) headers["X-Organization-Token"] = organizationToken;
  if (userRole) headers["x-user-role"] = userRole;
  if (teamId) headers["x-team-id"] = teamId;
  return headers;
}

export interface UseBehavioralTrackingArgs {
  taskId: number | null | undefined;
  userId: number | null | undefined;
}

export function useBehavioralTracking({
  taskId,
  userId,
}: UseBehavioralTrackingArgs): void {
  const enabled = Boolean(taskId && userId);
  const { flush, reset } = useFocusSignals({ enabled });

  const [sessionId, setSessionId] = useState<number | null>(null);
  const windowStartIsoRef = useRef<string>("");
  const pendingRef = useRef<BehavioralSignalInput[]>([]);
  const sessionIdRef = useRef<number | null>(null);
  sessionIdRef.current = sessionId;

  const pushPending = useCallback((item: BehavioralSignalInput) => {
    const q = pendingRef.current;
    q.push(item);
    while (q.length > MAX_PENDING_WINDOWS) {
      q.shift();
    }
  }, []);

  const trySendPending = useCallback(
    async (sid: number): Promise<void> => {
      const q = pendingRef.current;
      if (q.length === 0) return;
      const chunk = q.slice(0, 100);
      try {
        await BehavioralTrackingAPI.postSignals(sid, chunk);
        q.splice(0, chunk.length);
      } catch (error) {
        // Backend returns 400 when the session is already ended.
        // Stop tracking silently for this session to avoid retry loops.
        if (
          (error as { response?: { status?: number } })?.response?.status ===
          400
        ) {
          pendingRef.current = [];
          setSessionId(null);
          return;
        }
        /* keep buffer for next tick on other errors */
      }
    },
    [],
  );

  const snapshotAndQueue = useCallback((): void => {
    const counters = flush();
    const windowEnded = new Date().toISOString();
    const windowStarted = windowStartIsoRef.current || windowEnded;
    windowStartIsoRef.current = windowEnded;
    const item: BehavioralSignalInput = {
      ...counters,
      window_started_at: windowStarted,
      window_ended_at: windowEnded,
    };
    const isEmptyWindow =
      item.focused_ms === 0 &&
      item.keystroke_count === 0 &&
      item.backspace_count === 0 &&
      item.tab_switch_count === 0 &&
      item.rapid_switch_count === 0 &&
      item.mouse_hesitation_count === 0 &&
      item.inactivity_pause_count === 0 &&
      item.repeated_navigation_count === 0 &&
      item.abnormal_interruption_count === 0;
    if (isEmptyWindow) return;
    pushPending(item);
  }, [flush, pushPending]);

  /** Create / replace session when task or user changes. */
  useEffect(() => {
    if (!taskId || !userId) {
      setSessionId(null);
      return;
    }

    let cancelled = false;
    let createdId: number | null = null;

    (async () => {
      try {
        const res = await BehavioralTrackingAPI.createSession(taskId);
        if (cancelled) {
          try {
            await BehavioralTrackingAPI.endSession(res.data.id);
          } catch {
            /* best effort */
          }
          return;
        }
        createdId = res.data.id;
        setSessionId(res.data.id);
        windowStartIsoRef.current = new Date().toISOString();
        pendingRef.current = [];
      } catch {
        if (!cancelled) setSessionId(null);
      }
    })();

    return () => {
      cancelled = true;
      if (createdId != null) {
        BehavioralTrackingAPI.endSession(createdId).catch(() => {});
      }
      setSessionId(null);
    };
  }, [taskId, userId]);

  /** Periodic flush + visibility-driven flush. */
  useEffect(() => {
    if (!sessionId) return;

    const runFlushCycle = async () => {
      snapshotAndQueue();
      await trySendPending(sessionId);
    };

    const intervalId = window.setInterval(runFlushCycle, REPORT_INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        void runFlushCycle();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    const onPageHide = () => {
      const sid = sessionIdRef.current;
      if (!sid) return;
      const apiBase = DEFAULT_API_BASE.replace(/\/$/, "");
      if (!apiBase) {
        return;
      }
      const counters = flush();
      const windowEnded = new Date().toISOString();
      const windowStarted = windowStartIsoRef.current || windowEnded;
      windowStartIsoRef.current = windowEnded;
      const item: BehavioralSignalInput = {
        ...counters,
        window_started_at: windowStarted,
        window_ended_at: windowEnded,
      };
      const headers = buildAuthHeaders();
      const hasPayload =
        item.focused_ms !== 0 ||
        item.keystroke_count !== 0 ||
        item.backspace_count !== 0 ||
        item.tab_switch_count !== 0 ||
        item.rapid_switch_count !== 0 ||
        item.mouse_hesitation_count !== 0 ||
        item.inactivity_pause_count !== 0 ||
        item.repeated_navigation_count !== 0 ||
        item.abnormal_interruption_count !== 0;

      if (hasPayload) {
        void fetch(
          `${apiBase}/api/behavioral-tracking/sessions/${sid}/signals/`,
          {
            method: "POST",
            keepalive: true,
            headers,
            body: JSON.stringify({ signals: [item] }),
          },
        );
      }
      void fetch(`${apiBase}/api/behavioral-tracking/sessions/${sid}/end/`, {
        method: "POST",
        keepalive: true,
        headers,
        body: "{}",
      });
    };
    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [sessionId, snapshotAndQueue, trySendPending, flush]);

  /** Normal teardown: axios flush + end (page stays open). */
  useEffect(() => {
    if (!sessionId) return;
    return () => {
      const sid = sessionId;
      snapshotAndQueue();
      void (async () => {
        await trySendPending(sid);
        try {
          await BehavioralTrackingAPI.endSession(sid);
        } catch {
          /* ignore */
        }
      })();
      reset();
    };
  }, [sessionId, snapshotAndQueue, trySendPending, reset]);
}
