"use client";

import { useEffect, useState } from "react";
import { CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { WorkflowTriggerLog } from "@/types/agent";
import { TriggerBadge } from "./TriggerBadge";
import { cn } from "@/lib/utils";

interface TriggerTimelineProps {
  workflowId: string;
  limit?: number;
  className?: string;
}

const STATUS_ICONS = {
  triggered: CheckCircle,
  failed: XCircle,
  skipped: AlertCircle,
};

const STATUS_COLORS = {
  triggered: "text-green-500",
  failed: "text-red-500",
  skipped: "text-amber-500",
};

const STATUS_BG_COLORS = {
  triggered: "bg-green-50 dark:bg-green-950/20",
  failed: "bg-red-50 dark:bg-red-950/20",
  skipped: "bg-amber-50 dark:bg-amber-950/20",
};

export function TriggerTimeline({
  workflowId,
  limit = 20,
  className,
}: TriggerTimelineProps) {
  const [logs, setLogs] = useState<WorkflowTriggerLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchLogs() {
      try {
        setIsLoading(true);
        const response = await fetch(
          `/api/agent/trigger-logs/?workflow_id=${workflowId}&limit=${limit}`
        );
        if (response.ok) {
          const data = await response.json();
          setLogs(data);
        }
      } catch (error) {
        console.error("Failed to fetch trigger logs:", error);
      } finally {
        setIsLoading(false);
      }
    }

    if (workflowId) {
      fetchLogs();
    }
  }, [workflowId, limit]);

  if (isLoading) {
    return (
      <div className={cn("space-y-3", className)}>
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800"
          />
        ))}
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className={cn("text-center py-8", className)}>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No trigger history yet
        </p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {logs.map((log) => {
        const StatusIcon = STATUS_ICONS[log.status];
        const statusColor = STATUS_COLORS[log.status];
        const statusBgColor = STATUS_BG_COLORS[log.status];

        return (
          <div
            key={log.id}
            className={cn(
              "flex gap-3 rounded-lg border p-3 transition-colors",
              statusBgColor,
              "border-gray-200 dark:border-gray-700"
            )}
          >
            <div className="flex-shrink-0">
              <StatusIcon className={cn("h-4 w-4", statusColor)} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <TriggerBadge triggerType={log.trigger_type} size="sm" />
                <span className="text-sm font-medium capitalize text-gray-900 dark:text-gray-100">
                  {log.status}
                </span>
              </div>

              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {formatDistanceToNow(new Date(log.created_at), {
                  addSuffix: true,
                })}
                {log.execution_time_ms && (
                  <span className="ml-2">
                    • {log.execution_time_ms}ms
                  </span>
                )}
              </div>

              {log.error_message && (
                <div className="mt-2 text-xs text-red-600 dark:text-red-400">
                  {log.error_message}
                </div>
              )}

              {log.trigger_context && Object.keys(log.trigger_context).length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200">
                    View context
                  </summary>
                  <pre className="mt-2 overflow-x-auto rounded bg-gray-100 p-2 text-xs dark:bg-gray-900">
                    {JSON.stringify(log.trigger_context, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
