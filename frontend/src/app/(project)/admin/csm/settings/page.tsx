'use client';

import Link from 'next/link';
import { FileText, FolderKanban, ListOrdered, Radio } from 'lucide-react';
import CsmSettingsPageRoot, { CsmSettingsProjectGuard } from '@/components/csm-settings/CsmSettingsPageRoot';
import CsmSettingsNavCard from '@/components/csm-settings/CsmSettingsNavCard';
import { useProjectIdFromUrl } from '@/components/csm-settings/useProjectIdFromUrl';
import { SECONDARY_BUTTON_CLASS } from '@/components/csm-settings/constants';

export default function CsmSettingsHubPage() {
  const { projectValid } = useProjectIdFromUrl();

  return (
    <CsmSettingsPageRoot>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customer Service Settings</h1>
          <p className="mt-1 text-sm text-gray-500">
            Configure support projects, work types, and support channels for request forms.
          </p>
        </div>
        {projectValid && (
          <Link
            href={`/admin/ticket-forms`}
            className={SECONDARY_BUTTON_CLASS}
          >
            <FileText className="h-4 w-4" aria-hidden />
            Ticket Forms
          </Link>
        )}
      </div>

      {!projectValid ? (
        <CsmSettingsProjectGuard />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <CsmSettingsNavCard
            href={`/admin/csm/settings/support-projects`}
            icon={FolderKanban}
            title="Support Projects"
            description="Classify tickets by support area. Optional default queue per project."
          />
          <CsmSettingsNavCard
            href={`/admin/csm/settings/channels${q}`}
            icon={Radio}
            title="Support Channels"
            description="Live chat, contact forms, and email. Operating hours and EG assignments."
          />
          <CsmSettingsNavCard
            href={`/admin/csm/settings/work-types${q}`}
            icon={ListOrdered}
            title="Work Types"
            description="Define request kinds shown on ticket forms. Drag to reorder."
          />
        </div>
      )}
    </CsmSettingsPageRoot>
  );
}
