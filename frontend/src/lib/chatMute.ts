import type { ChatParticipant } from '@/types/chat';

export const TEMP_MUTE_OPTIONS = [
  { id: '1h', label: 'For 1 hour' },
  { id: 'tomorrow', label: 'Until tomorrow' },
  { id: '1w', label: 'For 1 week' },
] as const;

export type TemporaryMutePreset = (typeof TEMP_MUTE_OPTIONS)[number]['id'];

export function getTemporaryMuteUntil(preset: TemporaryMutePreset, now = new Date()): Date {
  const until = new Date(now);

  if (preset === '1h') {
    until.setHours(until.getHours() + 1);
    return until;
  }

  if (preset === '1w') {
    until.setDate(until.getDate() + 7);
    return until;
  }

  until.setDate(until.getDate() + 1);
  until.setHours(9, 0, 0, 0);
  if (until <= now) {
    until.setDate(until.getDate() + 1);
  }
  return until;
}

export function isParticipantCurrentlyMuted(
  participant?: Pick<ChatParticipant, 'is_muted' | 'muted_until'> | null,
  now = new Date()
): boolean {
  if (!participant?.is_muted) return false;
  if (!participant.muted_until) return true;

  const until = new Date(participant.muted_until);
  if (Number.isNaN(until.getTime())) return true;
  return until > now;
}

export function formatMutedUntil(iso: string): string {
  const until = new Date(iso);
  if (Number.isNaN(until.getTime())) return 'scheduled time';

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(until);
}
