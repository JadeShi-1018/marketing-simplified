"use client";

import { Sparkles } from "lucide-react";
import type { AgentWorkflowTemplate } from "@/types/agent";

interface TemplateInfoDrawerProps {
  template: AgentWorkflowTemplate;
  onCreateWorkflow: () => void;
  onCancel: () => void;
  isCreating?: boolean;
}

export default function TemplateInfoDrawer({
  template,
  onCreateWorkflow,
  onCancel,
  isCreating = false,
}: TemplateInfoDrawerProps) {
  return (
    <div className="flex h-full w-1/3 flex-col bg-gradient-to-br from-[#3CCED7] to-[#A6E661]">
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Template Name - Largest text */}
        <div className="mb-6 border-b border-white/20 pb-6">
          <h1 className="text-[34px] font-bold leading-tight text-white">
            {template.name}
          </h1>
        </div>

        {/* Description */}
        {template.description && (
          <div className="mb-6 border-b border-white/20 pb-6">
            <p className="text-[21px] leading-relaxed text-white/95">
              {template.description}
            </p>
          </div>
        )}

        {/* Use Cases */}
        {template.use_cases && template.use_cases.length > 0 && (
          <div className="mb-6 border-b border-white/20 pb-6">
            <h3 className="mb-3 text-[19px] font-semibold text-white">
              Use Cases
            </h3>
            <ul className="space-y-2">
              {template.use_cases.map((useCase, index) => (
                <li key={index} className="flex items-start gap-2 text-[21px] text-white/90">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-white/70" />
                  <span className="flex-1">{useCase}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Informational tip */}
        <div className="rounded-lg bg-white/10 p-4 backdrop-blur-sm">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-white" />
            <span className="text-[17px] font-semibold text-white">Why Use Templates?</span>
          </div>
          <p className="text-[17px] leading-relaxed text-white/90">
            Templates help you quickly create workflows, reducing repetitive tasks and optimizing your process.
            You can also create custom templates to help others.
          </p>
        </div>
      </div>

      {/* Fixed footer with buttons */}
      <div className="border-t border-white/20 p-6">
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={onCreateWorkflow}
            disabled={isCreating}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#3CCED7] shadow-sm transition-all hover:scale-[1.02] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isCreating ? "Creating..." : "Create Workflow"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex w-full items-center justify-center rounded-xl border border-white/30 bg-transparent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
