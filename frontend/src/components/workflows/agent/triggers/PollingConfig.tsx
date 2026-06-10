"use client";

import { Video, Table2, Layers, FileText, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PollingExternalService } from "@/types/agent";

type IntervalMinutes = 5 | 15 | 30 | 60;

export interface PollingConfigState {
  interval_minutes: IntervalMinutes;
  external_services: PollingExternalService[];
}

interface PollingConfigProps {
  config: PollingConfigState;
  onChange: (config: PollingConfigState) => void;
}

const SERVICE_OPTIONS: Array<{
  id: PollingExternalService;
  label: string;
  description: string;
  icon: typeof Video;
  iconColor: string;
  activeBorder: string;
}> = [
  {
    id: "zoom",
    label: "Zoom",
    description: "Detect new meeting recordings and summaries",
    icon: Video,
    iconColor: "text-blue-600 bg-blue-50",
    activeBorder: "border-blue-300",
  },
  {
    id: "google_sheets",
    label: "Google Sheets",
    description: "Detect spreadsheet data changes",
    icon: Table2,
    iconColor: "text-green-600 bg-green-50",
    activeBorder: "border-green-300",
  },
  {
    id: "linear",
    label: "Linear",
    description: "Detect issue status changes",
    icon: Layers,
    iconColor: "text-violet-600 bg-violet-50",
    activeBorder: "border-violet-300",
  },
  {
    id: "notion",
    label: "Notion",
    description: "Detect page content updates",
    icon: FileText,
    iconColor: "text-gray-700 bg-gray-100",
    activeBorder: "border-gray-400",
  },
];

const INTERVAL_OPTIONS: Array<{ value: IntervalMinutes; label: string }> = [
  { value: 5, label: "Every 5 min" },
  { value: 15, label: "Every 15 min" },
  { value: 30, label: "Every 30 min" },
  { value: 60, label: "Every hour" },
];

export function PollingConfig({ config, onChange }: PollingConfigProps) {
  const selectedServices = config.external_services ?? [];

  const toggleService = (serviceId: PollingExternalService) => {
    const next = selectedServices.includes(serviceId)
      ? selectedServices.filter((s) => s !== serviceId)
      : [...selectedServices, serviceId];
    onChange({ ...config, external_services: next });
  };

  const setInterval = (interval: IntervalMinutes) => {
    onChange({ ...config, interval_minutes: interval });
  };

  return (
    <div className="space-y-5">
      {/* Check Interval */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Check Interval
        </label>
        <div className="flex flex-wrap gap-2">
          {INTERVAL_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setInterval(value)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                config.interval_minutes === value
                  ? "border-transparent bg-gradient-to-r from-[#3CCED7] to-[#A6E661] text-white"
                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* External Services */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">
          Monitor External Services
        </label>
        <p className="text-xs text-gray-500 mb-3">
          Requires the service to be connected in Integrations settings.
        </p>
        <div className="grid grid-cols-1 gap-2">
          {SERVICE_OPTIONS.map((service) => {
            const Icon = service.icon;
            const selected = selectedServices.includes(service.id);
            return (
              <button
                key={service.id}
                type="button"
                onClick={() => toggleService(service.id)}
                className={cn(
                  "flex items-center gap-3 rounded-lg border-2 p-3 text-left transition-all",
                  selected
                    ? `${service.activeBorder} bg-white shadow-sm`
                    : "border-gray-100 bg-gray-50 hover:border-gray-200"
                )}
              >
                <div className={cn("rounded-lg p-1.5 shrink-0", service.iconColor)}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{service.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{service.description}</p>
                </div>
                {/* Selection indicator */}
                <div
                  className={cn(
                    "h-4 w-4 rounded-full shrink-0 transition-colors flex items-center justify-center",
                    selected
                      ? "bg-gradient-to-r from-[#3CCED7] to-[#A6E661]"
                      : "border-2 border-gray-300 bg-white"
                  )}
                >
                  {selected && <Check className="h-2.5 w-2.5 text-white" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selectedServices.length === 0 && (
        <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
          Select at least one service to enable polling.
        </p>
      )}
    </div>
  );
}
