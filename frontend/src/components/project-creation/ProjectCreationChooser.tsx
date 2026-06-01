'use client';

import { ArrowRight, ListChecks, Sparkles } from 'lucide-react';

export type ProjectCreationChooserProps = {
  title: string;
  description?: string;
  onQuickStart: () => void;
  onClassic: () => void;
  className?: string;
};

export default function ProjectCreationChooser({
  title,
  description,
  onQuickStart,
  onClassic,
  className = '',
}: ProjectCreationChooserProps) {
  return (
    <div className={`w-full ${className}`.trim()}>
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 text-xs text-gray-500 uppercase tracking-[0.2em] mb-3">
          <Sparkles className="w-4 h-4 text-[#3CCED7]" />
          New project
        </div>
        <h2 className="text-2xl font-semibold text-gray-900">{title}</h2>
        {description ? <p className="text-gray-600 mt-2 text-sm max-w-lg mx-auto">{description}</p> : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={onQuickStart}
          className="group text-left rounded-2xl border-2 border-[#3CCED7]/40 bg-gradient-to-br from-[#3CCED7]/10 via-white to-[#A6E661]/10 p-6 shadow-sm hover:border-[#3CCED7] hover:shadow-md transition-all"
        >
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#0d9488]">
              <Sparkles className="w-4 h-4" />
              Quick Start
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[#3CCED7] bg-white/80 px-2 py-0.5 rounded-full">
              Recommended
            </span>
          </div>
          <p className="text-sm text-gray-700 leading-relaxed">
            Describe your campaign in words. We draft tasks, a budget spreadsheet, and calendar milestones.
          </p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-gray-900 group-hover:text-[#0d9488]">
            Get started
            <ArrowRight className="w-4 h-4" />
          </span>
        </button>

        <button
          type="button"
          onClick={onClassic}
          className="group text-left rounded-2xl border border-gray-200 bg-white p-6 shadow-sm hover:border-gray-300 hover:shadow-md transition-all"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-3">
            <ListChecks className="w-4 h-4 text-gray-500" />
            Classic setup
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">
            Step through project name, media types, and teammate invites — the original onboarding flow.
          </p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-gray-700 group-hover:text-gray-900">
            Use classic wizard
            <ArrowRight className="w-4 h-4" />
          </span>
        </button>
      </div>
    </div>
  );
}
