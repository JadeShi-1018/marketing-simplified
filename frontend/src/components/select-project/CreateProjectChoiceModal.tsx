'use client';

import { X } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import ProjectCreationChooser from '@/components/project-creation/ProjectCreationChooser';

type CreateProjectChoiceModalProps = {
  open: boolean;
  onClose: () => void;
  onQuickStart: () => void;
  onClassic: () => void;
};

export default function CreateProjectChoiceModal({
  open,
  onClose,
  onQuickStart,
  onClassic,
}: CreateProjectChoiceModalProps) {
  return (
    <Modal isOpen={open} onClose={onClose}>
      <div className="w-[min(720px,calc(100vw-2rem))]">
        <div className="relative rounded-2xl bg-white shadow-2xl ring-1 ring-gray-100 overflow-hidden">
          <div className="h-[3px] w-full bg-gradient-to-r from-[#3CCED7] to-[#A6E661]" />
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="px-6 sm:px-8 pt-8 pb-8">
            <ProjectCreationChooser
              title="Create a new project"
              description="Quick Start builds a draft from your campaign brief. Classic setup uses the step-by-step form."
              onQuickStart={onQuickStart}
              onClassic={onClassic}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
