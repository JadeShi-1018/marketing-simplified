"use client";

import { forwardRef, useImperativeHandle, useState, useEffect } from "react";
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
  initialConfig?: WorkflowTriggerConfig;
  isSystem?: boolean;
  disabled?: boolean;
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
    initialConfig,
    isSystem = false,
    disabled = false,
    onSave,
  },
  ref,
) {
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

  // Sync state when initialConfig changes (e.g., after save)
  useEffect(() => {
    if (initialConfig?.trigger_type && initialConfig.trigger_type !== triggerType) {
      setTriggerType(initialConfig.trigger_type);

      // Sync corresponding config based on trigger type
      if (initialConfig.trigger_type === "instant" && initialConfig.instant) {
        setInstantConfig(initialConfig.instant);
      } else if (initialConfig.trigger_type === "polling" && initialConfig.polling) {
        setPollingConfig({
          interval_minutes: initialConfig.polling.interval_minutes,
          external_services: initialConfig.polling.external_services ?? [],
        });
      } else if (initialConfig.trigger_type === "scheduled" && initialConfig.scheduled) {
        setScheduledConfig({
          cron_expression: initialConfig.scheduled.cron_expression ?? "0 9 * * 1",
          timezone: initialConfig.scheduled.timezone ?? "UTC",
        });
      }
    }
  }, [initialConfig]);

  const handleSave = async () => {
    if (isSystem) return;

    // Validate configuration before saving
    if (triggerType === "polling" && pollingConfig.external_services.length === 0) {
      toast.error("Please select at least one service to enable polling.");
      return;
    }
    if (triggerType === "instant" && (!instantConfig?.event_types || instantConfig.event_types.length === 0)) {
      toast.error("Please select at least one event to enable instant triggers.");
      return;
    }
    if (triggerType === "scheduled" && (!scheduledConfig?.cron_expression || scheduledConfig.cron_expression === "")) {
      toast.error("Please add at least one time slot for scheduled triggers.");
      return;
    }

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

  const isDisabled = disabled || isSystem;

  return (
    <div className="space-y-5">
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
              <div
                key={option.type}
                className={cn(
                  "rounded-xl transition-all flex",
                  isSelected ? "p-[2px] bg-gradient-to-r from-[#3CCED7] to-[#A6E661]" : ""
                )}
              >
                <button
                  type="button"
                  disabled={isDisabled}
                  onClick={() => setTriggerType(option.type)}
                  className={cn(
                    "flex w-full h-full items-start gap-3 p-3 text-left transition-all",
                    isSelected
                      ? "rounded-[10px] bg-white"
                      : "rounded-xl border-2 border-transparent bg-gray-50 hover:bg-gray-100",
                    isDisabled && "cursor-not-allowed opacity-50",
                  )}
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
              </div>
            );
          })}
        </div>
      </div>

      {/* Type-specific config — rendered inline, no box wrapper */}
      <div className="pt-1">
        {triggerType === "instant" && (
          <InstantConfig
            workflowId={workflowId}
            config={instantConfig}
            disabled={isDisabled}
            onChange={setInstantConfig}
          />
        )}

        {triggerType === "scheduled" && (
          <ScheduledConfig
            config={scheduledConfig}
            disabled={isDisabled}
            onChange={setScheduledConfig}
          />
        )}

        {triggerType === "polling" && (
          <PollingConfig
            config={pollingConfig}
            disabled={isDisabled}
            onChange={setPollingConfig}
          />
        )}

        {triggerType === "manual" && (
          <p className="text-xs text-gray-500 leading-relaxed">
            This workflow can be triggered manually from the workflow list or
            editor.
          </p>
        )}
      </div>

      {saving && (
        <p className="text-xs text-gray-400 text-right">Saving…</p>
      )}
    </div>
  );
});
