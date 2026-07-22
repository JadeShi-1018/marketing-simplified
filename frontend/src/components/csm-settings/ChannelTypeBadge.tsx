'use client';

import type { ChannelType } from '@/types/supportChannel';
import { CHANNEL_TYPE_LABELS } from '@/types/supportChannel';

const BADGE_STYLES: Record<ChannelType, string> = {
  live_chat: 'bg-indigo-100 text-indigo-800',
  contact_form: 'bg-amber-100 text-amber-800',
  email: 'bg-sky-100 text-sky-800',
};

interface Props {
  type: ChannelType;
}

export default function ChannelTypeBadge({ type }: Props) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE_STYLES[type]}`}
    >
      {CHANNEL_TYPE_LABELS[type]}
    </span>
  );
}
