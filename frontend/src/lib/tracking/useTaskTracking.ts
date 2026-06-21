'use client';

// TASK_OPEN and FIRST_INTERACTION are now detected server-side by ServerSideTrackingMiddleware.
// Hook shell kept for call-site compatibility.
export function useTaskTracking(_taskId: number | string, _projectId?: number | string | null) {
  return {
    markInteraction: (_element: string, _action: string): void => {},
  };
}
