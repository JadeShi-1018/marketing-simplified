"use client";

import { useState, useEffect } from "react";
import { Activity, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import type { AgentWorkflowDefinition, WorkflowTriggerLog } from "@/types/agent";
import { AgentAPI } from "@/lib/api/agentApi";
import { TriggerBadge } from "./TriggerBadge";
import { TriggerTimeline } from "./TriggerTimeline";
import { cn } from "@/lib/utils";

interface TriggerDashboardProps {
  className?: string;
}

interface TriggerStats {
  total_triggers_today: number;
  successful: number;
  failed: number;
  skipped: number;
}

export function TriggerDashboard({ className }: TriggerDashboardProps) {
  const [workflows, setWorkflows] = useState<AgentWorkflowDefinition[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [stats, setStats] = useState<TriggerStats>({
    total_triggers_today: 0,
    successful: 0,
    failed: 0,
    skipped: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setIsLoading(true);
    try {
      // Load workflows with active status
      const workflowsData = await AgentAPI.listWorkflowDefinitions();
      const activeWorkflows = workflowsData.filter((w) => w.status === 'active');
      setWorkflows(activeWorkflows);

      if (activeWorkflows.length > 0) {
        setSelectedWorkflowId(activeWorkflows[0].id);

        // Calculate stats from all workflows
        let totalTriggersToday = 0;
        let successful = 0;
        let failed = 0;
        let skipped = 0;

        for (const workflow of activeWorkflows) {
          try {
            const logs = await AgentAPI.getTriggerLogs(workflow.id, 100);
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const todayLogs = logs.filter((log) => {
              const logDate = new Date(log.created_at);
              return logDate >= today;
            });

            totalTriggersToday += todayLogs.length;
            successful += todayLogs.filter((log) => log.status === "triggered").length;
            failed += todayLogs.filter((log) => log.status === "failed").length;
            skipped += todayLogs.filter((log) => log.status === "skipped").length;
          } catch (error) {
            console.error(`Error loading logs for workflow ${workflow.id}:`, error);
          }
        }

        setStats({
          total_triggers_today: totalTriggersToday,
          successful,
          failed,
          skipped,
        });
      }
    } catch (error) {
      console.error("Error loading dashboard data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center p-12", className)}>
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-[#3CCED7]" />
          <p className="text-sm text-gray-500">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (workflows.length === 0) {
    return (
      <div className={cn("rounded-lg border border-gray-200 bg-white p-12", className)}>
        <div className="text-center">
          <Activity className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-semibold text-gray-900">No Active Triggers</h3>
          <p className="mt-2 text-sm text-gray-500">
            Enable triggers on your workflows to see monitoring data here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* Statistics Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Activity}
          label="Triggers Today"
          value={stats.total_triggers_today}
          color="text-gray-600"
          bgColor="bg-gray-100"
        />
        <StatCard
          icon={CheckCircle}
          label="Successful"
          value={stats.successful}
          color="text-green-600"
          bgColor="bg-green-100"
        />
        <StatCard
          icon={XCircle}
          label="Failed"
          value={stats.failed}
          color="text-red-600"
          bgColor="bg-red-100"
        />
        <StatCard
          icon={AlertCircle}
          label="Skipped"
          value={stats.skipped}
          color="text-amber-600"
          bgColor="bg-amber-100"
        />
      </div>

      {/* Active Workflows */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">Active Workflows</h3>
          <p className="mt-1 text-sm text-gray-500">
            {workflows.length} workflow{workflows.length !== 1 ? "s" : ""} with triggers enabled
          </p>
        </div>
        <div className="divide-y divide-gray-100">
          {workflows.map((workflow) => (
            <button
              key={workflow.id}
              type="button"
              onClick={() => setSelectedWorkflowId(workflow.id)}
              className={cn(
                "flex w-full items-center justify-between px-6 py-4 text-left transition-colors hover:bg-gray-50",
                selectedWorkflowId === workflow.id && "bg-[#3CCED7]/5"
              )}
            >
              <div className="flex-1">
                <h4 className="text-sm font-medium text-gray-900">{workflow.name}</h4>
                {workflow.description && (
                  <p className="mt-1 text-xs text-gray-500 line-clamp-1">{workflow.description}</p>
                )}
              </div>
              <div className="ml-4">
                <TriggerBadge
                  triggerType={workflow.trigger_config?.trigger_type || "manual"}
                  showLabel
                  size="sm"
                />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Trigger History */}
      {selectedWorkflowId && (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-6 py-4">
            <h3 className="text-lg font-semibold text-gray-900">Trigger History</h3>
            <p className="mt-1 text-sm text-gray-500">
              Recent triggers for {workflows.find((w) => w.id === selectedWorkflowId)?.name}
            </p>
          </div>
          <div className="p-6">
            <TriggerTimeline workflowId={selectedWorkflowId} limit={20} />
          </div>
        </div>
      )}
    </div>
  );
}

interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: string;
  bgColor: string;
}

function StatCard({ icon: Icon, label, value, color, bgColor }: StatCardProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{label}</p>
          <p className={cn("mt-2 text-3xl font-bold", color)}>{value}</p>
        </div>
        <div className={cn("rounded-full p-3", bgColor)}>
          <Icon className={cn("h-6 w-6", color)} />
        </div>
      </div>
    </div>
  );
}
