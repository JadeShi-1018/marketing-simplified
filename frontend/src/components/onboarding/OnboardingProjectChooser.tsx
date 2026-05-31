'use client';

import ProjectCreationChooser from '@/components/project-creation/ProjectCreationChooser';

type OnboardingProjectChooserProps = {
  onQuickStart: () => void;
  onClassic: () => void;
};

export default function OnboardingProjectChooser({
  onQuickStart,
  onClassic,
}: OnboardingProjectChooserProps) {
  return (
    <div className="relative z-[9999] w-full max-w-3xl mx-auto px-4">
      <div className="bg-white shadow-2xl rounded-2xl border border-gray-100 p-8 sm:p-10">
        <ProjectCreationChooser
          title="Set up your first project"
          description="Pick Quick Start for an AI-generated draft, or use the classic wizard if you prefer forms."
          onQuickStart={onQuickStart}
          onClassic={onClassic}
        />
      </div>
    </div>
  );
}
