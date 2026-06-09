"use client";

import { X } from "lucide-react";
import { TriggerConfigPanel, TriggerTimeline } from "../triggers";
import type { WorkflowTriggerConfig } from "@/types/agent";

interface TriggerDrawerProps {
  isOpen: boolean;
  workflowId: string;
  initialEnabled?: boolean;
  initialConfig?: WorkflowTriggerConfig;
  isSystem?: boolean;
  onClose: () => void;
  onSave: () => void;
}

export default function TriggerDrawer({
  isOpen,
  workflowId,
  initialEnabled,
  initialConfig,
  isSystem,
  onClose,
  onSave,
}: TriggerDrawerProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-2xl flex-col bg-gray-50 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Workflow Triggers</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Configure how this workflow should be triggered
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {/* Trigger Configuration */}
            <TriggerConfigPanel
              workflowId={workflowId}
              initialEnabled={initialEnabled}
              initialConfig={initialConfig}
              isSystem={isSystem}
              onSave={() => {
                onSave();
                // Don't close drawer automatically so user can see the result
              }}
            />

            {/* Trigger History */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-100 px-4 py-3">
                <h3 className="text-sm font-semibold text-gray-900">Trigger History</h3>
                <p className="mt-0.5 text-xs text-gray-500">
                  Recent workflow trigger events
                </p>
              </div>
              <div className="p-4">
                <TriggerTimeline workflowId={workflowId} limit={20} />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 bg-white px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </>
  );
}
