'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';

type QuickStartGeneratingProps = {
  message?: string;
  mode?: 'preview' | 'confirm';
};

type ProgressStage = {
  untilPercent: number;
  label: string;
};

const PREVIEW_STAGES: ProgressStage[] = [
  { untilPercent: 22, label: 'Understanding your campaign details…' },
  { untilPercent: 52, label: 'Building a structured campaign plan…' },
  { untilPercent: 82, label: 'Generating tasks, calendar, and workspace draft…' },
  { untilPercent: 96, label: 'Finalizing your preview…' },
];

const CONFIRM_STAGES: ProgressStage[] = [
  { untilPercent: 28, label: 'Creating your project…' },
  { untilPercent: 60, label: 'Seeding enabled modules…' },
  { untilPercent: 90, label: 'Final checks and indexing…' },
  { untilPercent: 98, label: 'Wrapping up…' },
];

export default function QuickStartGenerating({
  message = 'Generating your project draft with AI…',
  mode = 'preview',
}: QuickStartGeneratingProps) {
  const [progress, setProgress] = useState(6);
  const stages = mode === 'confirm' ? CONFIRM_STAGES : PREVIEW_STAGES;

  useEffect(() => {
    setProgress(6);
    const timer = window.setInterval(() => {
      setProgress((prev) => {
        if (prev >= 98) return prev;
        const next = prev + Math.max(1, Math.round((100 - prev) * 0.06));
        return Math.min(next, 98);
      });
    }, 900);
    return () => window.clearInterval(timer);
  }, [mode]);

  const stageLabel = useMemo(() => {
    const current = stages.find((stage) => progress <= stage.untilPercent);
    return current?.label ?? stages[stages.length - 1].label;
  }, [progress, stages]);

  return (
    <div
      className="flex flex-col items-center justify-center gap-4 py-16 text-center"
      role="status"
      aria-live="polite"
    >
      <div className="relative">
        <Sparkles className="w-8 h-8 text-[#3CCED7] animate-pulse" aria-hidden />
        <Loader2
          className="w-10 h-10 text-[#3CCED7] animate-spin absolute -top-1 -left-1 opacity-40"
          aria-hidden
        />
      </div>
      <p className="text-sm text-gray-700 max-w-md">{message}</p>
      <div className="w-full max-w-md space-y-2">
        <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#3CCED7] to-[#A6E661] transition-all duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{stageLabel}</span>
          <span>{progress}%</span>
        </div>
      </div>
    </div>
  );
}
