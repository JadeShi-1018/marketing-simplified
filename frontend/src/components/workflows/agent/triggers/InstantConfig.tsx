"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface InstantConfigProps {
  workflowId: string;
  config?: {
    event_types?: string[];
    webhook_enabled?: boolean;
    webhook_secret?: string;
  };
  onChange?: (config: {
    event_types: string[];
    webhook_enabled: boolean;
    webhook_secret?: string;
  }) => void;
}

const EVENT_OPTIONS = [
  {
    value: "task.created",
    label: "Task Created",
    description: "Triggered when a new task is created",
  },
  {
    value: "task.status_changed",
    label: "Task Status Changed",
    description: "Triggered when a task status changes",
  },
  {
    value: "spreadsheet.uploaded",
    label: "Spreadsheet Uploaded",
    description: "Triggered when a new spreadsheet is uploaded",
  },
  {
    value: "decision.approved",
    label: "Decision Approved",
    description: "Triggered when a decision is approved",
  },
];

export function InstantConfig({ workflowId, config, onChange }: InstantConfigProps) {
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  const webhookUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/api/agent/webhooks/${workflowId}/`;
  const webhookSecret = config?.webhook_secret || "your-webhook-secret-here";

  const handleEventToggle = (eventType: string) => {
    const currentEvents = config?.event_types || [];
    const newEvents = currentEvents.includes(eventType)
      ? currentEvents.filter(e => e !== eventType)
      : [...currentEvents, eventType];

    onChange?.({
      event_types: newEvents,
      webhook_enabled: config?.webhook_enabled || false,
      webhook_secret: config?.webhook_secret,
    });
  };

  const handleWebhookToggle = () => {
    onChange?.({
      event_types: config?.event_types || [],
      webhook_enabled: !config?.webhook_enabled,
      webhook_secret: config?.webhook_secret,
    });
  };

  const copyToClipboard = async (text: string, type: 'webhook' | 'secret') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'webhook') {
        setCopiedWebhook(true);
        setTimeout(() => setCopiedWebhook(false), 2000);
      } else {
        setCopiedSecret(true);
        setTimeout(() => setCopiedSecret(false), 2000);
      }
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Event Types Section */}
      <div>
        <h4 className="text-sm font-medium text-gray-900 mb-3">Listen to Events</h4>
        <div className="space-y-2">
          {EVENT_OPTIONS.map((event) => {
            const isSelected = config?.event_types?.includes(event.value);

            return (
              <label
                key={event.value}
                className={cn(
                  "flex items-start gap-3 rounded-lg border-2 p-3 cursor-pointer transition-all",
                  isSelected
                    ? "border-amber-400 bg-amber-50 dark:bg-amber-950/20"
                    : "border-gray-200 hover:border-gray-300 bg-white"
                )}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => handleEventToggle(event.value)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{event.label}</p>
                  <p className="mt-0.5 text-xs text-gray-500">{event.description}</p>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* Webhook Section */}
      <div className="border-t border-gray-200 pt-6">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium text-gray-900">Webhook Integration</h4>
          <label className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-600">Enable Webhook</span>
            <button
              type="button"
              onClick={handleWebhookToggle}
              className={cn(
                "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                config?.webhook_enabled ? "bg-amber-500" : "bg-gray-300"
              )}
            >
              <span
                className={cn(
                  "inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform",
                  config?.webhook_enabled ? "translate-x-5" : "translate-x-1"
                )}
              />
            </button>
          </label>
        </div>

        {config?.webhook_enabled && (
          <div className="space-y-4 rounded-lg bg-amber-50 dark:bg-amber-950/10 p-4">
            {/* Webhook URL */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Webhook URL
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={webhookUrl}
                  readOnly
                  className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-xs text-gray-900"
                />
                <button
                  type="button"
                  onClick={() => copyToClipboard(webhookUrl, 'webhook')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  {copiedWebhook ? (
                    <>
                      <Check className="h-3 w-3" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      Copy
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Webhook Secret */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Webhook Secret (for signature validation)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={webhookSecret}
                  readOnly
                  className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-xs text-gray-900"
                />
                <button
                  type="button"
                  onClick={() => copyToClipboard(webhookSecret, 'secret')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  {copiedSecret ? (
                    <>
                      <Check className="h-3 w-3" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      Copy
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Usage Instructions */}
            <div className="mt-4 rounded-lg bg-amber-100 dark:bg-amber-900/20 p-3">
              <p className="text-xs font-medium text-amber-900 dark:text-amber-200 mb-2">
                How to use webhooks:
              </p>
              <ul className="space-y-1 text-xs text-amber-800 dark:text-amber-300">
                <li>• Send POST requests to the webhook URL above</li>
                <li>• Include <code className="bg-amber-200 dark:bg-amber-900 px-1 rounded">X-Webhook-Signature</code> header with HMAC-SHA256 signature</li>
                <li>• Use the webhook secret to generate the signature</li>
                <li>• Payload will be passed to the workflow as trigger context</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
