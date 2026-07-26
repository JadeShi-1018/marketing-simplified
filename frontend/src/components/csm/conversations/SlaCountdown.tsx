'use client';

import { useRef } from 'react';
import { Check, Clock, Pause } from 'lucide-react';
import type { Ticket, SlaState } from '@/types/csmConversation';

// Why the countdown is standing still, or null when it is actively ticking.
function frozenReason(ticket: Ticket): string | null {
  if (ticket.sla?.clock_running ?? true) return null;
  return ticket.status === 'pending_customer' ? 'paused' : 'off-hours';
}

// Shared between the ticket card (MyTicketsPanel) and the detail drawer so the
// countdown renders identically in both places.

export function formatRemaining(seconds: number): string {
  if (seconds <= 0) return 'Overdue';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function slaStateColor(state: SlaState | null): string {
  if (state === 'breached') return 'text-red-600';
  if (state === 'amber') return 'text-orange-500';
  return 'text-gray-400';
}

// The backend computes remaining time against the business-hours calendar. We
// tick that snapshot down locally for smoothness and re-sync whenever the
// ticket reloads; colour always follows the backend state, never the local tick.
// When the clock isn't running (outside business hours, or paused) we hold the
// snapshot still — the authoritative remaining time isn't moving either.
function useTicking(remaining: number | null, now: number, running: boolean): number | null {
  const base = useRef<{ seconds: number; atMs: number } | null>(null);
  if (remaining === null) {
    base.current = null;
    return null;
  }
  if (base.current === null || base.current.seconds !== remaining) {
    base.current = { seconds: remaining, atMs: now };
  }
  // While the clock is frozen we hold the snapshot still and keep the anchor at
  // the current moment, so that when it resumes only time spent running counts
  // down and the number doesn't lurch by the whole frozen gap.
  if (!running) {
    base.current.atMs = now;
    return base.current.seconds;
  }
  const elapsed = (now - base.current.atMs) / 1000;
  return Math.max(0, base.current.seconds - elapsed);
}

interface SlaCountdownProps {
  ticket: Ticket;
  now: number;
}

// Compact single-metric badge for ticket cards: shows the most relevant
// deadline only — first response while it is still counting, otherwise
// resolution. The full labelled breakdown lives in the ticket detail (SlaDetail).
export function SlaCountdown({ ticket, now }: SlaCountdownProps) {
  const { sla } = ticket;
  const running = sla?.clock_running ?? true;
  const fr = useTicking(sla?.first_response_remaining_seconds ?? null, now, running);
  const res = useTicking(sla?.resolution_remaining_seconds ?? null, now, running);

  let body: React.ReactNode = null;
  if (fr !== null) {
    body = (
      <span className={slaStateColor(sla.first_response_state)}>
        First {sla.first_response_breached ? 'overdue' : formatRemaining(fr)}
      </span>
    );
  } else if (res !== null) {
    body = (
      <span className={slaStateColor(sla.resolution_state)}>
        Res {sla.resolution_breached ? 'overdue' : formatRemaining(res)}
      </span>
    );
  } else if (sla?.first_response_met) {
    body = (
      <span className="flex items-center gap-0.5 text-green-600">
        <Check size={10} className="shrink-0" />
        First met
      </span>
    );
  }

  if (body === null) {
    return (
      <span className="flex items-center gap-1 text-[11px] text-gray-300">
        <Clock size={10} className="shrink-0" />
        No SLA
      </span>
    );
  }

  const frozen = frozenReason(ticket);

  return (
    <span className="flex items-center gap-1 text-[11px]" title={frozen ? `Countdown ${frozen}` : undefined}>
      {frozen ? (
        <Pause size={10} className="shrink-0 text-gray-400" />
      ) : (
        <Clock size={10} className="shrink-0 text-gray-400" />
      )}
      {body}
      {frozen && <span className="text-gray-400">· {frozen}</span>}
    </span>
  );
}

// Full labelled SLA breakdown for the ticket detail drawer: both legs on their
// own line with their full names.
export function SlaDetail({ ticket, now }: SlaCountdownProps) {
  const { sla } = ticket;
  const running = sla?.clock_running ?? true;
  const fr = useTicking(sla?.first_response_remaining_seconds ?? null, now, running);
  const res = useTicking(sla?.resolution_remaining_seconds ?? null, now, running);

  // No policy governs this ticket (or SLA tracking is off): show a plain marker
  // rather than empty legs and a misleading "paused" note.
  const hasSla = !!sla && (
    sla.first_response_due != null || sla.resolution_due != null || sla.first_response_met
  );
  if (!hasSla) {
    return <div className="text-xs text-gray-400">No SLA</div>;
  }

  const firstValue = (() => {
    if (sla?.first_response_met) {
      return (
        <span className="flex items-center gap-0.5 text-green-600">
          <Check size={12} className="shrink-0" /> Met
        </span>
      );
    }
    if (fr !== null) {
      return (
        <span className={slaStateColor(sla.first_response_state)}>
          {sla.first_response_breached ? 'Overdue' : `${formatRemaining(fr)} left`}
        </span>
      );
    }
    if (sla?.first_response_breached) {
      return <span className="text-red-600">Missed</span>;
    }
    return <span className="text-gray-300">—</span>;
  })();

  const resValue = res !== null
    ? (
      <span className={slaStateColor(sla.resolution_state)}>
        {sla.resolution_breached ? 'Overdue' : `${formatRemaining(res)} left`}
      </span>
    )
    : <span className="text-gray-300">—</span>;

  const frozen = frozenReason(ticket);

  return (
    <div className="flex flex-col gap-1.5 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-gray-500">First Response</span>
        {firstValue}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-gray-500">Resolution</span>
        {resValue}
      </div>
      {frozen && (
        <div className="flex items-center gap-1 text-gray-400">
          <Pause size={11} className="shrink-0" />
          {frozen === 'paused' ? 'Paused — awaiting customer' : 'Paused — outside business hours'}
        </div>
      )}
    </div>
  );
}
