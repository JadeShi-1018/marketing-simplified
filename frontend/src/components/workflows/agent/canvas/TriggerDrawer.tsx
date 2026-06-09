"use client";

import { useRef, useState } from "react";
import { X, Save } from "lucide-react";
import {
  TriggerConfigPanel,
  TriggerTimeline,
  type TriggerConfigPanelHandle,
} from "../triggers";
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
  const panelRef = useRef<TriggerConfigPanelHandle>(null);
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await panelRef.current?.save();
      onSave();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Workflow Triggers
            </h2>
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
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Trigger configuration — flat, no card wrapper */}
          <TriggerConfigPanel
            ref={panelRef}
            workflowId={workflowId}
            initialEnabled={initialEnabled}
            initialConfig={initialConfig}
            isSystem={isSystem}
            onSave={onSave}
          />

          {/* Trigger History — thin separator, no card */}
          <div className="mt-8 border-t border-gray-100 pt-6">
            <h3 className="mb-4 text-sm font-semibold text-gray-900">
              Trigger History
            </h3>
            <TriggerTimeline workflowId={workflowId} limit={20} />
          </div>
        </div>

        {/* Footer — Save only */}
        {!isSystem && (
          <div className="border-t border-gray-100 bg-white px-6 py-4">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#3CCED7] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#35b8c0] disabled:opacity-50 transition-colors"
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving…" : "Save Configuration"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
