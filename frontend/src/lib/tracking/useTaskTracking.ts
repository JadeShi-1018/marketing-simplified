'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useTracking, type TrackingTarget } from './TrackingProvider';

const TASK_CONTENT_TYPE = 'task.task';

export function useTaskTracking(taskId: number, projectId?: number | null) {
  const { emit, setActiveTarget } = useTracking();

  // Stable target ref — always current without causing stale closures
  const targetRef = useRef<TrackingTarget>({
    contentType: TASK_CONTENT_TYPE,
    objectId: taskId,
    projectId: projectId ?? null,
  });
  useEffect(() => {
    targetRef.current = { contentType: TASK_CONTENT_TYPE, objectId: taskId, projectId: projectId ?? null };
  });

  // Register this task as the active target so idle events are attributed here
  useEffect(() => {
    setActiveTarget({ contentType: TASK_CONTENT_TYPE, objectId: taskId, projectId: projectId ?? null });
    return () => setActiveTarget(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, projectId, setActiveTarget]);

  // TASK_OPEN: fire on taskId change, deduplicated within 30 s
  useEffect(() => {
    const key = `tracking:lastOpen:${taskId}`;
    const lastOpenAt = sessionStorage.getItem(key);
    const now = Date.now();
    if (!lastOpenAt || now - Number(lastOpenAt) > 30_000) {
      emit('TASK_OPEN', targetRef.current, { from_route: window.location.pathname });
      sessionStorage.setItem(key, String(now));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  // FIRST_INTERACTION: fires once per hook lifetime; reset when taskId changes
  const firstInteractionFired = useRef(false);
  useEffect(() => {
    firstInteractionFired.current = false;
  }, [taskId]);

  const markInteraction = useCallback(
    (element: string, action: string) => {
      if (firstInteractionFired.current) return;
      firstInteractionFired.current = true;
      emit('FIRST_INTERACTION', targetRef.current, { element, action });
    },
    [emit],
  );

  return { markInteraction };
}
