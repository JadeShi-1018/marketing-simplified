'use client';

import { CalendarPlus } from 'lucide-react';
import type { SuggestedCalendarEvent } from '@/types/agent';
import { AgentMessageBoardText } from './AgentMessageBoardText';

interface CalendarEventsCardProps {
  events: SuggestedCalendarEvent[];
  messageId: string;
  blockId: string;
}

export function CalendarEventsCard({ events, messageId, blockId }: CalendarEventsCardProps) {
  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-violet-200 bg-violet-50/80 px-3 py-2 text-sm text-violet-900">
        <AgentMessageBoardText
          target="No calendar events were suggested for this upload."
          partId={`${messageId}-calendar-empty`}
          blockId={blockId}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-violet-900">
        <CalendarPlus className="h-4 w-4 shrink-0" />
        <AgentMessageBoardText
          target={`Suggested calendar events (${events.length})`}
          partId={`${messageId}-calendar-title`}
          blockId={blockId}
        />
      </div>
      <ul className="space-y-2">
        {events.map((evt, index) => (
          <li
            key={`${evt.title}-${evt.start_datetime}-${index}`}
            className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm"
          >
            <p className="font-medium text-foreground">{evt.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {evt.start_datetime} — {evt.end_datetime}
            </p>
            {evt.location ? (
              <p className="text-xs text-muted-foreground mt-0.5">{evt.location}</p>
            ) : null}
            {evt.description ? (
              <p className="text-xs text-foreground mt-1">{evt.description}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
