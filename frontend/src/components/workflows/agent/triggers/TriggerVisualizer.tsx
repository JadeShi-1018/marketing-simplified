"use client";

import { Clock, Zap, Calendar, CheckCircle, Loader2 } from "lucide-react";
import type { TriggerType } from "@/types/agent";
import { cn } from "@/lib/utils";

interface TriggerVisualizerProps {
  workflowId: string;
  triggerType?: TriggerType;
  triggerState?: {
    last_successful_trigger?: string;
    next_scheduled_run?: string;
    last_polling_check?: string;
  };
  status?: "idle" | "checking" | "triggered";
  className?: string;
}

export function TriggerVisualizer({
  triggerType = "manual",
  triggerState,
  status = "idle",
  className,
}: TriggerVisualizerProps) {
  if (triggerType === "polling") {
    return <PollingVisualizer status={status} triggerState={triggerState} className={className} />;
  }
  if (triggerType === "instant") {
    return <InstantVisualizer status={status} className={className} />;
  }
  if (triggerType === "scheduled") {
    return <ScheduledVisualizer triggerState={triggerState} className={className} />;
  }
  if (triggerType === "manual") {
    return <ManualVisualizer className={className} />;
  }
  return null;
}

interface VisualizerProps {
  status?: "idle" | "checking" | "triggered";
  triggerState?: {
    last_successful_trigger?: string;
    next_scheduled_run?: string;
    last_polling_check?: string;
  };
  className?: string;
}

function PollingVisualizer({ status, triggerState, className }: VisualizerProps) {
  const nextCheckTime = triggerState?.last_polling_check
    ? getRelativeTime(new Date(new Date(triggerState.last_polling_check).getTime() + 5 * 60000))
    : "soon";

  return (
    <div className={cn("flex items-center gap-2 text-xs text-gray-600", className)}>
      {status === "checking" ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
          <span className="text-blue-600">Checking...</span>
        </>
      ) : (
        <>
          <Clock className="h-3 w-3 text-blue-500" />
          <span>Next check: {nextCheckTime}</span>
        </>
      )}
    </div>
  );
}

function InstantVisualizer({ status, className }: VisualizerProps) {
  return (
    <div className={cn("flex items-center gap-2 text-xs", className)}>
      {status === "triggered" ? (
        <>
          <CheckCircle className="h-3 w-3 text-green-500" />
          <span className="text-green-600">Triggered</span>
        </>
      ) : (
        <>
          <div className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-500" />
          </div>
          <span className="text-amber-600">Listening...</span>
        </>
      )}
    </div>
  );
}

function ScheduledVisualizer({ triggerState, className }: VisualizerProps) {
  const nextRun = triggerState?.next_scheduled_run
    ? getRelativeTime(new Date(triggerState.next_scheduled_run))
    : "Not scheduled";

  return (
    <div className={cn("flex items-center gap-2 text-xs text-gray-600", className)}>
      <Calendar className="h-3 w-3 text-indigo-500" />
      <span>Next run: {nextRun}</span>
    </div>
  );
}

function ManualVisualizer({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 text-xs text-gray-500", className)}>
      <CheckCircle className="h-3 w-3" />
      <span>Ready</span>
    </div>
  );
}

// Helper function to format relative time
function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMins = Math.round(diffMs / 60000);

  if (diffMins < 0) {
    return "overdue";
  }
  if (diffMins < 1) {
    return "in < 1 min";
  }
  if (diffMins < 60) {
    return `in ${diffMins} min`;
  }

  const diffHours = Math.round(diffMins / 60);
  if (diffHours < 24) {
    return `in ${diffHours}h`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `in ${diffDays}d`;
}
