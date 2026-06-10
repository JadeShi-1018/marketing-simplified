"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { Clock, Zap, Calendar, Hand } from "lucide-react";
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

export interface TriggerConfigPanelHandle {
  save: () => Promise<void>;
}

const TRIGGER_OPTIONS: Array<{
  type: TriggerType;
  icon: typeof Clock;
  label: string;
  description: string;
  iconColor: string;
  iconBg: string;
}> = [
  {
    type: "manual",
    icon: Hand,
    label: "Manual",
    description: "Trigger workflow manually when needed",
    iconColor: "text-gray-600",
    iconBg: "bg-gray-100",
  },
  {
    type: "polling",
    icon: Clock,
    label: "Polling",
    description: "Check for changes periodically",
    iconColor: "text-blue-600",
    iconBg: "bg-blue-50",
  },
  {
    type: "instant",
    icon: Zap,
    label: "Instant",
    description: "Trigger on events immediately",
    iconColor: "text-amber-600",
    iconBg: "bg-amber-50",
  },
  {
    type: "scheduled",
    icon: Calendar,
    label: "Scheduled",
    description: "Run on a fixed schedule",
    iconColor: "text-indigo-600",
    iconBg: "bg-indigo-50",
  },
];

export const TriggerConfigPanel = forwardRef<
  TriggerConfigPanelHandle,
  TriggerConfigPanelProps
>(function TriggerConfigPanel(
  {
    workflowId,
    initialEnabled = false,
    initialConfig,
    isSystem = false,
    onSave,
  },
  ref,
) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [triggerType, setTriggerType] = useState<TriggerType>(
    initialConfig?.trigger_type || "manual",
  );
  const [instantConfig, setInstantConfig] = useState(
    initialConfig?.instant || {
      event_types: [],
      webhook_enabled: false,
    },
  );
  const [scheduledConfig, setScheduledConfig] = useState<{
    cron_expression: string;
    timezone: string;
  }>({
    cron_expression: initialConfig?.scheduled?.cron_expression ?? "0 9 * * 1",
    timezone: initialConfig?.scheduled?.timezone ?? "UTC",
  });
  const [pollingConfig, setPollingConfig] = useState<PollingConfigState>(
    initialConfig?.polling
      ? {
          interval_minutes: initialConfig.polling.interval_minutes,
          external_services:
            initialConfig.polling.external_services ?? [],
        }
      : { interval_minutes: 15, external_services: [] },
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (isSystem) return;

    setSaving(true);
    try {
      const config: WorkflowTriggerConfig = {
        trigger_type: triggerType,
      };

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

  useImperativeHandle(ref, () => ({ save: handleSave }));

  const disabled = isSystem || !enabled;

  return (
    <div className="space-y-5">
      {/* Enable toggle */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">Enable trigger</span>
        <button
          type="button"
          disabled={isSystem}
          onClick={() => setEnabled(!enabled)}
          className={cn(
            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
            enabled ? "bg-emerald-500" : "bg-gray-300",
            isSystem && "cursor-not-allowed opacity-50",
          )}
        >
          <span
            className={cn(
              "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
              enabled ? "translate-x-6" : "translate-x-1",
            )}
          />
        </button>
      </div>

      {/* Trigger Type grid */}
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-gray-700">
          Trigger Type
        </label>
        <div className="grid grid-cols-2 gap-2">
          {TRIGGER_OPTIONS.map((option) => {
            const Icon = option.icon;
            const isSelected = triggerType === option.type;

            return (
              <button
                key={option.type}
                type="button"
                disabled={disabled}
                onClick={() => setTriggerType(option.type)}
                className={cn(
                  "flex items-start gap-3 rounded-xl p-3 text-left transition-all",
                  isSelected
                    ? "border-2 bg-[#3CCED7]/5"
                    : "border-2 border-transparent bg-gray-50 hover:bg-gray-100",
                  disabled && "cursor-not-allowed opacity-50",
                )}
                style={isSelected ? {
                  borderImage: 'linear-gradient(135deg, #3CCED7, #A6E661) 1'
                } : undefined}
              >
                <div
                  className={cn(
                    "rounded-lg p-2 shrink-0",
                    option.iconBg,
                  )}
                >
                  <Icon className={cn("h-4 w-4", option.iconColor)} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {option.label}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500 leading-snug">
                    {option.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Type-specific config — rendered inline, no box wrapper */}
      {enabled && (
        <div className="pt-1">
          {triggerType === "instant" && (
            <InstantConfig
              workflowId={workflowId}
              config={instantConfig}
              onChange={setInstantConfig}
            />
          )}

          {triggerType === "scheduled" && (
            <ScheduledConfig
              config={scheduledConfig}
              onChange={setScheduledConfig}
            />
          )}

          {triggerType === "polling" && (
            <PollingConfig config={pollingConfig} onChange={setPollingConfig} />
          )}

          {triggerType === "manual" && (
            <p className="text-xs text-gray-500 leading-relaxed">
              This workflow can be triggered manually from the workflow list or
              editor.
            </p>
          )}
        </div>
      )}

      {saving && (
        <p className="text-xs text-gray-400 text-right">Saving…</p>
      )}
    </div>
  );
});
