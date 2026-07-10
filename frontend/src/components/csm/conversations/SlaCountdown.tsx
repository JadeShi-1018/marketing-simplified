'use client';

import { Clock } from 'lucide-react';
import type { Ticket } from '@/types/csmConversation';

// MED-216: shared between the ticket card (MyTicketsPanel) and the ticket
// detail drawer, so the countdown renders identically in both places.

export function formatRemaining(seconds: number): string {
  if (seconds <= 0) return 'Overdue';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function slaColor(seconds: number, breached: boolean): string {
  if (breached || seconds <= 0) return 'text-red-600';
  if (seconds < 3600) return 'text-orange-500';
  return 'text-gray-400';
}

interface SlaCountdownProps {
  ticket: Ticket;
  now: number;
}

export function SlaCountdown({ ticket, now }: SlaCountdownProps) {
  const { sla, first_response_due, resolution_due } = ticket;
  if (!first_response_due && !resolution_due) {
    return (
      <span className="flex items-center gap-1 text-[11px] text-gray-300">
        <Clock size={10} className="shrink-0" />
        No SLA
      </span>
    );
  }

  const frSec = first_response_due
    ? Math.floor((new Date(first_response_due).getTime() - now) / 1000)
    : null;
  const resSec = resolution_due
    ? Math.floor((new Date(resolution_due).getTime() - now) / 1000)
    : null;

  const frBreached = sla?.first_response_breached || (frSec !== null && frSec <= 0);
  const resBreached = sla?.resolution_breached || (resSec !== null && resSec <= 0);

  return (
    <span className="flex items-center gap-1 text-[11px]">
      <Clock size={10} className="shrink-0 text-gray-400" />
      {frSec !== null && (
        <span className={slaColor(frSec, frBreached)}>
          {frBreached ? 'Overdue' : formatRemaining(frSec)}
        </span>
      )}
      {frSec !== null && resSec !== null && (
        <span className="text-gray-300">·</span>
      )}
      {resSec !== null && (
        <span className={slaColor(resSec, resBreached)}>
          Res {resBreached ? 'overdue' : formatRemaining(resSec)}
        </span>
      )}
    </span>
  );
}
