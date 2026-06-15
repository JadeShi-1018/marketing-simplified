'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { SECONDARY_BUTTON_CLASS } from './constants';

interface Props {
  projectId: number;
}

export default function SettingsHubLink({ projectId }: Props) {
  return (
    <Link
      href={`/admin/csm/settings?project=${projectId}`}
      className={SECONDARY_BUTTON_CLASS}
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      Settings
    </Link>
  );
}
