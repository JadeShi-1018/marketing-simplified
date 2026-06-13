"use client";

import { Sparkles } from "lucide-react";
import type { AgentWorkflowTemplate } from "@/types/agent";

interface TemplateInfoDrawerProps {
  template: AgentWorkflowTemplate;
  onCreateWorkflow: () => void;
  onCancel: () => void;
}

export default function TemplateInfoDrawer({
  template,
  onCreateWorkflow,
  onCancel,
}: TemplateInfoDrawerProps) {
  return (
    <div className="flex h-full w-1/3 flex-col border-r border-gray-200 bg-white">
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Template Name - Largest text */}
        <h1 className="mb-6 text-2xl font-bold text-gray-900">
          {template.name}
        </h1>

        {/* Description */}
        {template.description && (
          <div className="mb-6 border-b border-gray-200 pb-6">
            <p className="text-base leading-relaxed text-gray-600">
              {template.description}
            </p>
          </div>
        )}

        {/* Use Cases */}
        {template.use_cases && template.use_cases.length > 0 && (
          <div className="mb-6 border-b border-gray-200 pb-6">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">
              Use Cases
            </h3>
            <ul className="space-y-2">
              {template.use_cases.map((useCase, index) => (
                <li key={index} className="flex items-start gap-2 text-base text-gray-600">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gray-400" />
                  <span className="flex-1">{useCase}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Informational tip */}
        <div className="rounded-lg bg-gradient-to-br from-[#3CCED7]/10 to-[#A6E661]/10 p-4">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#3CCED7]" />
            <span className="text-xs font-semibold text-gray-700">Why Use Templates?</span>
          </div>
          <p className="text-xs leading-relaxed text-gray-600">
            Templates help you quickly create workflows, reducing repetitive tasks and optimizing your process.
            You can also create custom templates to help others.
          </p>
        </div>
      </div>

      {/* Fixed footer with buttons */}
      <div className="border-t border-gray-200 bg-white p-6">
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={onCreateWorkflow}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#3CCED7] to-[#A6E661] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-95"
          >
            Create Workflow
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex w-full items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
