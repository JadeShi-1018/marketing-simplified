"use client";

import { useState } from "react";
import { Calendar } from "lucide-react";

interface ScheduledConfigProps {
  config?: {
    cron_expression?: string;
    timezone?: string;
  };
  onChange?: (config: { cron_expression: string; timezone: string }) => void;
}

const cronPresets: Record<string, string> = {
  "Every Monday 9am": "0 9 * * 1",
  "Every day 9am": "0 9 * * *",
  "Every hour": "0 * * * *",
  "Every 30 minutes": "*/30 * * * *",
  "Every 15 minutes": "*/15 * * * *",
  "Every weekday 9am": "0 9 * * 1-5",
};

export function ScheduledConfig({ config, onChange }: ScheduledConfigProps) {
  const [cronExpression, setCronExpression] = useState(
    config?.cron_expression || "0 9 * * 1"
  );
  const [timezone] = useState(config?.timezone || "UTC");

  const handleCronChange = (newCron: string) => {
    setCronExpression(newCron);
    onChange?.({ cron_expression: newCron, timezone });
  };

  return (
    <div className="space-y-4 rounded-lg border border-green-200 bg-green-50 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-green-900">
        <Calendar className="h-4 w-4" />
        Scheduled Trigger Configuration
      </div>

      {/* Quick Presets */}
      <div>
        <label className="mb-2 block text-xs font-medium text-gray-700">
          Quick Presets
        </label>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(cronPresets).map(([label, cron]) => (
            <button
              key={label}
              type="button"
              onClick={() => handleCronChange(cron)}
              className={`rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                cronExpression === cron
                  ? "border-green-600 bg-green-600 text-white"
                  : "border-gray-300 bg-white text-gray-700 hover:border-green-500 hover:bg-green-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Cron Expression Input */}
      <div>
        <label className="mb-2 block text-xs font-medium text-gray-700">
          Cron Expression
        </label>
        <input
          type="text"
          value={cronExpression}
          onChange={(e) => handleCronChange(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          placeholder="0 9 * * 1"
        />
        <p className="mt-1 text-xs text-gray-500">
          Format: <span className="font-mono">minute hour day month weekday</span>
        </p>
      </div>

      {/* Cron Expression Helper */}
      <div className="rounded-md bg-white p-3 text-xs text-gray-600">
        <p className="mb-1 font-medium">Quick Reference:</p>
        <ul className="space-y-0.5 pl-4">
          <li>• <span className="font-mono">*</span> = any value</li>
          <li>• <span className="font-mono">*/15</span> = every 15 units</li>
          <li>• <span className="font-mono">1-5</span> = range (Mon-Fri)</li>
          <li>• <span className="font-mono">0 9 * * 1</span> = Every Monday at 9:00 AM</li>
        </ul>
      </div>

      {/* Timezone Display */}
      <div className="flex items-center justify-between rounded-md bg-white px-3 py-2 text-xs">
        <span className="text-gray-600">Timezone:</span>
        <span className="font-mono font-medium text-gray-900">{timezone}</span>
      </div>
    </div>
  );
}
