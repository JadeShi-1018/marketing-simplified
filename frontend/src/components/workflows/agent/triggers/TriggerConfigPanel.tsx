"use client";

import { useState } from "react";
import { Clock, Zap, Calendar, Hand, Save, X } from "lucide-react";
import toast from "react-hot-toast";
import { AgentAPI } from "@/lib/api/agentApi";
import type { WorkflowTriggerConfig, TriggerType } from "@/types/agent";
import { cn } from "@/lib/utils";
import { InstantConfig } from "./InstantConfig";
import { ScheduledConfig } from "./ScheduledConfig";
import { PollingConfig, type PollingConfigState } from "./PollingConfig";

interface TriggerConfigPanelProps {
  workflowId: string;
  initialEnabled?: boolean;
  initialConfig?: WorkflowTriggerConfig;
  isSystem?: boolean;
  onSave?: () => void;
}

const TRIGGER_OPTIONS: Array<{
  type: TriggerType;
  icon: typeof Clock;
  label: string;
  description: string;
  color: string;
}> = [
  {
    type: "manual",
    icon: Hand,
    label: "Manual",
    description: "Trigger workflow manually when needed",
    color: "text-gray-600 bg-gray-50 hover:bg-gray-100",
  },
  {
    type: "polling",
    icon: Clock,
    label: "Polling",
    description: "Check for changes periodically",
    color: "text-blue-600 bg-blue-50 hover:bg-blue-100",
  },
  {
    type: "instant",
    icon: Zap,
    label: "Instant",
    description: "Trigger on events immediately",
    color: "text-amber-600 bg-amber-50 hover:bg-amber-100",
  },
  {
    type: "scheduled",
    icon: Calendar,
    label: "Scheduled",
    description: "Run on a fixed schedule",
    color: "text-indigo-600 bg-indigo-50 hover:bg-indigo-100",
  },
];

export function TriggerConfigPanel({
  workflowId,
  initialEnabled = false,
  initialConfig,
  isSystem = false,
  onSave,
}: TriggerConfigPanelProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [triggerType, setTriggerType] = useState<TriggerType>(
    initialConfig?.trigger_type || "manual"
  );
  const [instantConfig, setInstantConfig] = useState(initialConfig?.instant || {
    event_types: [],
    webhook_enabled: false,
  });
  const [scheduledConfig, setScheduledConfig] = useState<{ cron_expression: string; timezone: string }>({
    cron_expression: initialConfig?.scheduled?.cron_expression ?? "0 9 * * 1",
    timezone: initialConfig?.scheduled?.timezone ?? "UTC",
  });
  const [pollingConfig, setPollingConfig] = useState<PollingConfigState>(
    initialConfig?.polling
      ? { interval_minutes: initialConfig.polling.interval_minutes, external_services: initialConfig.polling.external_services ?? [] }
      : { interval_minutes: 15, external_services: [] }
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (isSystem) return;

    setSaving(true);
    try {
      const config: WorkflowTriggerConfig = {
        trigger_type: triggerType,
      };

      // Add type-specific config
      if (triggerType === "manual") {
        config.manual = { require_confirmation: false };
      } else if (triggerType === "polling") {
        config.polling = {
          interval_minutes: pollingConfig.interval_minutes,
          external_services: pollingConfig.external_services,
        };
      } else if (triggerType === "instant") {
        config.instant = instantConfig;
      } else if (triggerType === "scheduled") {
        config.scheduled = { ...scheduledConfig, enabled: true };
      }

      await AgentAPI.updateTriggerConfig(workflowId, {
        trigger_enabled: enabled,
        trigger_config: config,
      });

      toast.success("Trigger configuration saved");
      onSave?.();
    } catch (error) {
      toast.error("Failed to save trigger configuration");
      console.error("Error saving trigger config:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setEnabled(initialEnabled);
    setTriggerType(initialConfig?.trigger_type || "manual");
    setInstantConfig(initialConfig?.instant || {
      event_types: [],
      webhook_enabled: false,
    });
    setScheduledConfig({
      cron_expression: initialConfig?.scheduled?.cron_expression ?? "0 9 * * 1",
      timezone: initialConfig?.scheduled?.timezone ?? "UTC",
    });
    setPollingConfig(
      initialConfig?.polling
        ? { interval_minutes: initialConfig.polling.interval_minutes, external_services: initialConfig.polling.external_services ?? [] }
        : { interval_minutes: 15, external_services: [] }
    );
  };

  return (
    <div className="space-y-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Trigger Configuration</h3>
          <p className="mt-1 text-sm text-gray-500">
            {isSystem
              ? "System workflows cannot be configured"
              : "Configure how this workflow should be triggered"}
          </p>
        </div>

        {/* Enable/Disable Toggle */}
        <label className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">Enable</span>
          <button
            type="button"
            disabled={isSystem}
            onClick={() => setEnabled(!enabled)}
            className={cn(
              "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
              enabled ? "bg-emerald-500" : "bg-gray-300",
              isSystem && "opacity-50 cursor-not-allowed"
            )}
          >
            <span
              className={cn(
                "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                enabled ? "translate-x-6" : "translate-x-1"
              )}
            />
          </button>
        </label>
      </div>

      {/* Trigger Type Selection */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-700">Trigger Type</label>
        <div className="grid grid-cols-2 gap-3">
          {TRIGGER_OPTIONS.map((option) => {
            const Icon = option.icon;
            const isSelected = triggerType === option.type;

            return (
              <button
                key={option.type}
                type="button"
                disabled={isSystem || !enabled}
                onClick={() => setTriggerType(option.type)}
                className={cn(
                  "flex items-start gap-3 rounded-lg border-2 p-3 text-left transition-all",
                  isSelected
                    ? "border-[#3CCED7] bg-[#3CCED7]/5"
                    : "border-gray-200 hover:border-gray-300",
                  (isSystem || !enabled) && "opacity-50 cursor-not-allowed"
                )}
              >
                <div className={cn("rounded-lg p-2", option.color)}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{option.label}</p>
                  <p className="mt-0.5 text-xs text-gray-500">{option.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Type-specific Configuration */}
      {enabled && (
        <>
          {triggerType === "instant" && (
            <div className="rounded-lg border border-gray-200 p-4">
              <InstantConfig
                workflowId={workflowId}
                config={instantConfig}
                onChange={setInstantConfig}
              />
            </div>
          )}

          {triggerType === "scheduled" && (
            <ScheduledConfig
              config={scheduledConfig}
              onChange={setScheduledConfig}
            />
          )}

          {triggerType === "polling" && (
            <div className="rounded-lg border border-gray-200 p-4">
              <h4 className="text-sm font-medium text-gray-900 mb-4">Configuration Details</h4>
              <PollingConfig config={pollingConfig} onChange={setPollingConfig} />
            </div>
          )}

          {triggerType === "manual" && (
            <div className="rounded-lg bg-gray-50 p-4">
              <h4 className="text-sm font-medium text-gray-900 mb-2">Configuration Details</h4>
              <p className="text-xs text-gray-600">
                This workflow can be triggered manually from the workflow list or editor.
              </p>
            </div>
          )}
        </>
      )}

      {/* Action Buttons */}
      {!isSystem && (
        <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-4">
          <button
            type="button"
            onClick={handleReset}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
            Reset
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#3CCED7] px-3 py-2 text-sm font-semibold text-white hover:bg-[#35b8c0] disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save Configuration"}
          </button>
        </div>
      )}
    </div>
  );
}
