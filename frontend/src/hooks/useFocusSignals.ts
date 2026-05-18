"use client";

/**
 * useFocusSignals — listener-only hook that accumulates focus/behavioral
 * counters for the currently active focus session.
 *
 * PRIVACY (see Track-01 ticket):
 * - Never reads key content. The keydown handler only compares `e.key`
 *   against the literal strings 'Backspace' / 'Delete' to bump the
 *   backspace counter, then drops the event reference.
 * - Never stores mouse coordinates or pointer trajectories. We only look
 *   at `e.target.closest(...)` to know which interactive element is under
 *   the cursor, and discard the raw event.
 * - Never collects page text, form values, or DOM contents.
 *
 * PERFORMANCE:
 * - All counters live in a single ref; the hook never calls setState, so it
 *   triggers zero re-renders on its consumer.
 * - mousemove is throttled to 100ms; all listeners are { passive: true }.
 * - Only two intervals run: a 100ms focus tick and a 5s inactivity probe.
 *
 * Constants here intentionally mirror backend/behavioral_tracking/services.py
 * so the client- and server-side definitions of "rapid switch" and
 * "inactivity" stay aligned.
 */

import { useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const RAPID_NAV_WINDOW_MS = 3_000;
const RAPID_NAV_THRESHOLD = 3;
const INACTIVITY_THRESHOLD_MS = 30_000;
const HESITATION_THRESHOLD_MS = 800;
const FOCUS_TICK_MS = 100;
const INACTIVITY_TICK_MS = 5_000;
const MOUSEMOVE_THROTTLE_MS = 100;
const NAV_HISTORY_SIZE = 5;
const INTERACTIVE_SELECTOR =
  'button, a, [role="button"], input, textarea, select';

export interface FocusSignalCounters {
  focused_ms: number;
  keystroke_count: number;
  backspace_count: number;
  tab_switch_count: number;
  rapid_switch_count: number;
  mouse_hesitation_count: number;
  inactivity_pause_count: number;
  repeated_navigation_count: number;
  abnormal_interruption_count: number;
}

export interface FocusSignalHandle {
  /** Snapshot the current counters and reset them to zero. */
  flush: () => FocusSignalCounters;
  /** Drop counters without snapshotting (used on cleanup or disable). */
  reset: () => void;
}

interface InternalState {
  lastActivityAt: number;
  inInactivityState: boolean;
  isComposing: boolean;
  hoverElement: Element | null;
  hoverStartAt: number;
  lastMouseMoveAt: number;
  navTimestamps: number[];
  navPathStack: string[];
}

function emptyCounters(): FocusSignalCounters {
  return {
    focused_ms: 0,
    keystroke_count: 0,
    backspace_count: 0,
    tab_switch_count: 0,
    rapid_switch_count: 0,
    mouse_hesitation_count: 0,
    inactivity_pause_count: 0,
    repeated_navigation_count: 0,
    abnormal_interruption_count: 0,
  };
}

function initialState(): InternalState {
  return {
    lastActivityAt: typeof window === "undefined" ? 0 : Date.now(),
    inInactivityState: false,
    isComposing: false,
    hoverElement: null,
    hoverStartAt: 0,
    lastMouseMoveAt: 0,
    navTimestamps: [],
    navPathStack: [],
  };
}

export function useFocusSignals(options?: {
  enabled?: boolean;
}): FocusSignalHandle {
  const enabled = options?.enabled ?? true;

  const countersRef = useRef<FocusSignalCounters>(emptyCounters());
  const stateRef = useRef<InternalState>(initialState());

  // Pathname is only available inside the Next.js App Router; usePathname
  // returns null during SSR and outside a Router context. We tolerate that.
  const pathname = usePathname();

  // Path change detection: rapid switches + repeated A->B->A->B loops.
  useEffect(() => {
    if (!enabled || !pathname) return;
    const state = stateRef.current;
    const now = Date.now();

    state.navPathStack.push(pathname);
    if (state.navPathStack.length > NAV_HISTORY_SIZE) {
      state.navPathStack.shift();
    }

    const stk = state.navPathStack;
    if (stk.length >= 4) {
      const n = stk.length;
      if (
        stk[n - 1] === stk[n - 3] &&
        stk[n - 2] === stk[n - 4] &&
        stk[n - 1] !== stk[n - 2]
      ) {
        countersRef.current.repeated_navigation_count += 1;
        // Reset the pattern window to avoid counting the same loop repeatedly.
        state.navPathStack = [stk[n - 1]];
      }
    }

    state.navTimestamps.push(now);
    state.navTimestamps = state.navTimestamps.filter(
      (t) => now - t <= RAPID_NAV_WINDOW_MS,
    );
    // Count once when the window first crosses the threshold.
    if (state.navTimestamps.length === RAPID_NAV_THRESHOLD) {
      countersRef.current.rapid_switch_count += 1;
    }
  }, [enabled, pathname]);

  // Listener + timer installation.
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const state = stateRef.current;
    state.lastActivityAt = Date.now();

    const markActivity = () => {
      state.lastActivityAt = Date.now();
      state.inInactivityState = false;
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        countersRef.current.tab_switch_count += 1;
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (state.isComposing) return;
      countersRef.current.keystroke_count += 1;
      // Privacy: only the equality check uses e.key; the value is not stored.
      if (e.key === "Backspace" || e.key === "Delete") {
        countersRef.current.backspace_count += 1;
      }
      markActivity();
    };

    const onCompositionStart = () => {
      state.isComposing = true;
    };
    const onCompositionEnd = () => {
      state.isComposing = false;
    };

    const onMouseMove = (e: MouseEvent) => {
      const now = Date.now();
      if (now - state.lastMouseMoveAt < MOUSEMOVE_THROTTLE_MS) return;
      state.lastMouseMoveAt = now;

      const target =
        e.target instanceof Element
          ? e.target.closest(INTERACTIVE_SELECTOR)
          : null;

      if (target !== state.hoverElement) {
        if (state.hoverElement && state.hoverStartAt) {
          const dur = now - state.hoverStartAt;
          if (dur >= HESITATION_THRESHOLD_MS) {
            countersRef.current.mouse_hesitation_count += 1;
          }
        }
        state.hoverElement = target;
        state.hoverStartAt = target ? now : 0;
      }

      markActivity();
    };

    const onClick = () => {
      if (state.hoverElement && state.hoverStartAt) {
        const dur = Date.now() - state.hoverStartAt;
        if (dur >= HESITATION_THRESHOLD_MS) {
          countersRef.current.mouse_hesitation_count += 1;
        }
      }
      state.hoverElement = null;
      state.hoverStartAt = 0;
      markActivity();
    };

    const onScroll = () => markActivity();
    const onTouchStart = () => markActivity();

    const onError = () => {
      countersRef.current.abnormal_interruption_count += 1;
    };
    const onUnhandledRejection = () => {
      countersRef.current.abnormal_interruption_count += 1;
    };

    const passive: AddEventListenerOptions = { passive: true };

    document.addEventListener("visibilitychange", onVisibilityChange, passive);
    window.addEventListener("keydown", onKeyDown, passive);
    window.addEventListener("compositionstart", onCompositionStart, passive);
    window.addEventListener("compositionend", onCompositionEnd, passive);
    window.addEventListener("mousemove", onMouseMove, passive);
    window.addEventListener("click", onClick, passive);
    window.addEventListener("scroll", onScroll, passive);
    window.addEventListener("touchstart", onTouchStart, passive);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    const focusTick = window.setInterval(() => {
      if (
        document.hasFocus() &&
        document.visibilityState === "visible"
      ) {
        countersRef.current.focused_ms += FOCUS_TICK_MS;
      }
    }, FOCUS_TICK_MS);

    const inactivityTick = window.setInterval(() => {
      const now = Date.now();
      if (
        !state.inInactivityState &&
        now - state.lastActivityAt > INACTIVITY_THRESHOLD_MS
      ) {
        countersRef.current.inactivity_pause_count += 1;
        state.inInactivityState = true;
      }
    }, INACTIVITY_TICK_MS);

    return () => {
      document.removeEventListener(
        "visibilitychange",
        onVisibilityChange,
      );
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("compositionstart", onCompositionStart);
      window.removeEventListener("compositionend", onCompositionEnd);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("click", onClick);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("error", onError);
      window.removeEventListener(
        "unhandledrejection",
        onUnhandledRejection,
      );
      window.clearInterval(focusTick);
      window.clearInterval(inactivityTick);
    };
  }, [enabled]);

  const flush = useCallback((): FocusSignalCounters => {
    const snapshot = { ...countersRef.current };
    countersRef.current = emptyCounters();
    return snapshot;
  }, []);

  const reset = useCallback((): void => {
    countersRef.current = emptyCounters();
  }, []);

  return { flush, reset };
}
