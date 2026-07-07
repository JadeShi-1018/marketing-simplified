'use client';

import * as Popover from '@radix-ui/react-popover';
import { ChevronDown } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  WEEKDAYS,
  type OperatingHours,
  type Weekday,
} from '@/types/supportChannel';

const DAY_LABELS: Record<Weekday, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

const JS_DAY_TO_WEEKDAY: Weekday[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

const MINUTES_PER_DAY = 24 * 60;
const BRAND_GRADIENT = 'bg-gradient-to-r from-[#3CCED7] to-[#A6E661]';

const triggerOpenClass = 'border-[#3CCED7] ring-2 ring-[#3CCED7]/30';
const triggerClosedClass = 'border-gray-200';
const SLOT_MINUTES = 30;

function getTodayWeekday(): Weekday {
  return JS_DAY_TO_WEEKDAY[new Date().getDay()];
}

function parseMinutes(value?: string): number | null {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

function formatTime12h(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  let h = Number.parseInt(hStr, 10);
  const ampm = h >= 12 ? 'pm' : 'am';
  h %= 12;
  if (h === 0) h = 12;
  return `${h}:${mStr} ${ampm}`;
}

function buildTimeSlotOptions(): Array<{ value: string; label: string }> {
  const options: Array<{ value: string; label: string }> = [];
  for (let minutes = 0; minutes < 24 * 60; minutes += SLOT_MINUTES) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    options.push({ value, label: formatTime12h(value) });
  }
  return options;
}

const TIME_SLOT_OPTIONS = buildTimeSlotOptions();

function formatDuration(start: string, end: string): string | null {
  const startMin = parseMinutes(start);
  const endMin = parseMinutes(end);
  if (startMin === null || endMin === null || endMin <= startMin) return null;
  const total = endMin - startMin;
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

export function validateOperatingHours(hours: OperatingHours): string | null {
  for (const day of WEEKDAYS) {
    const cfg = hours[day];
    if (!cfg.enabled) continue;
    if (!cfg.start || !cfg.end) {
      return `${DAY_LABELS[day]} requires start and end times when enabled.`;
    }
    const start = parseMinutes(cfg.start);
    const end = parseMinutes(cfg.end);
    if (start === null || end === null || start >= end) {
      return `${DAY_LABELS[day]} start must be before end.`;
    }
  }
  return null;
}

interface Props {
  value: OperatingHours;
  onChange: (hours: OperatingHours) => void;
  disabled?: boolean;
}

interface TimeFieldProps {
  value: string;
  disabled?: boolean;
  onChange: (next: string) => void;
  ariaLabel: string;
}

function TimeField({ value, disabled, onChange, ariaLabel }: TimeFieldProps) {
  const [open, setOpen] = useState(false);
  const selectedRef = useRef<HTMLButtonElement>(null);

  const options = useMemo(() => {
    if (TIME_SLOT_OPTIONS.some((opt) => opt.value === value)) {
      return TIME_SLOT_OPTIONS;
    }
    return [
      ...TIME_SLOT_OPTIONS,
      { value, label: formatTime12h(value) },
    ].sort((a, b) => (parseMinutes(a.value) ?? 0) - (parseMinutes(b.value) ?? 0));
  }, [value]);

  useEffect(() => {
    if (open) {
      selectedRef.current?.scrollIntoView({ block: 'center' });
    }
  }, [open]);

  return (
    <Popover.Root
      open={disabled ? false : open}
      onOpenChange={(next) => {
        if (!disabled) setOpen(next);
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={`flex min-w-[104px] items-center justify-between gap-1.5 rounded-md border bg-white px-2.5 py-1.5 text-sm text-slate-800 transition focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
            open ? triggerOpenClass : triggerClosedClass
          }`}
        >
          <span className="truncate">{formatTime12h(value)}</span>
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform ${
              open ? 'rotate-180' : ''
            }`}
            aria-hidden
          />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={4}
          align="start"
          className="z-[200] overflow-hidden rounded-md border border-gray-200 bg-white shadow-md"
          style={{ width: 'var(--radix-popover-trigger-width)' }}
        >
          <ul role="listbox" aria-label={ariaLabel} className="max-h-52 overflow-y-auto py-1">
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <li key={opt.value} role="presentation">
                  <button
                    ref={isSelected ? selectedRef : undefined}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center px-3 py-2 text-left text-sm text-slate-800 transition hover:bg-slate-700 hover:text-white focus:bg-slate-700 focus:text-white focus:outline-none ${
                      isSelected ? 'bg-slate-100' : ''
                    }`}
                  >
                    {opt.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

interface DayToggleProps {
  enabled: boolean;
  disabled?: boolean;
  dayLabel: string;
  onChange: (enabled: boolean) => void;
}

function DayToggle({ enabled, disabled, dayLabel, onChange }: DayToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={`${dayLabel} open`}
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3CCED7]/60 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${
        enabled ? BRAND_GRADIENT : 'bg-slate-200'
      }`}
    >
      <span
        className={`pointer-events-none absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          enabled ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function TodayBadge() {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white ${BRAND_GRADIENT}`}
    >
      TODAY
    </span>
  );
}

interface TimelineBarProps {
  start: string;
  end: string;
}

function TimelineBar({ start, end }: TimelineBarProps) {
  const startMin = parseMinutes(start) ?? 0;
  const endMin = parseMinutes(end) ?? 0;
  const leftPct = (startMin / MINUTES_PER_DAY) * 100;
  const widthPct = Math.max(((endMin - startMin) / MINUTES_PER_DAY) * 100, 0);

  return (
    <div className="relative h-1.5 w-full rounded-full bg-slate-100">
      <div
        className={`absolute top-0 h-full rounded-full ${BRAND_GRADIENT}`}
        style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
      />
    </div>
  );
}

interface DayRowProps {
  day: Weekday;
  enabled: boolean;
  start: string;
  end: string;
  isToday: boolean;
  disabled?: boolean;
  onToggle: (enabled: boolean) => void;
  onUpdate: (patch: Partial<OperatingHours[Weekday]>) => void;
}

const DAY_TOGGLE_GAP_CLASS = 'ml-2.5';
/** Toggle (2.75rem) + gap before day label — timeline aligns with day name */
const TIMELINE_INSET_CLASS = 'pl-[calc(2.75rem+0.625rem)]';

function DayRow({
  day,
  enabled,
  start,
  end,
  isToday,
  disabled,
  onToggle,
  onUpdate,
}: DayRowProps) {
  const duration = formatDuration(start, end);

  return (
    <div className="border-b border-gray-200 px-3 py-3 last:border-b-0">
      <div className="relative w-full">
        <div className="flex items-center">
          <DayToggle
            enabled={enabled}
            disabled={disabled}
            dayLabel={DAY_LABELS[day]}
            onChange={onToggle}
          />
          <div className={`flex min-w-0 items-center gap-2 ${DAY_TOGGLE_GAP_CLASS}`}>
            <span
              className={`shrink-0 text-sm font-medium ${
                enabled ? 'text-slate-800' : 'text-slate-400'
              }`}
            >
              {DAY_LABELS[day]}
            </span>
            {enabled && isToday && <TodayBadge />}
          </div>

          {enabled && (
            <>
              <div className="min-w-8 flex-1" aria-hidden />
              <div className="shrink-0">
                <div className="flex items-center gap-2">
                  <TimeField
                    value={start}
                    disabled={disabled}
                    ariaLabel={`${DAY_LABELS[day]} open time`}
                    onChange={(next) => onUpdate({ start: next, enabled: true })}
                  />
                  <span className="shrink-0 text-sm text-gray-400">to</span>
                  <TimeField
                    value={end}
                    disabled={disabled}
                    ariaLabel={`${DAY_LABELS[day]} close time`}
                    onChange={(next) => onUpdate({ end: next, enabled: true })}
                  />
                </div>
                {duration && (
                  <p className="mt-0.5 text-right text-xs font-medium text-[#3CCED7]">
                    {duration}
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        {!enabled && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-400">
            Closed
          </span>
        )}

        {enabled && (
          <div className={`mt-2 ${TIMELINE_INSET_CLASS}`}>
            <TimelineBar start={start} end={end} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function OperatingHoursEditor({ value, onChange, disabled }: Props) {
  const today = getTodayWeekday();

  const updateDay = (day: Weekday, patch: Partial<OperatingHours[Weekday]>) => {
    onChange({
      ...value,
      [day]: { ...value[day], ...patch },
    });
  };

  const setDayEnabled = (day: Weekday, enabled: boolean) => {
    const current = value[day];
    if (enabled) {
      updateDay(day, {
        enabled: true,
        start: current.start ?? '09:00',
        end: current.end ?? '17:30',
      });
    } else {
      updateDay(day, { enabled: false });
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      {WEEKDAYS.map((day) => {
        const cfg = value[day];
        const start = cfg.start ?? '09:00';
        const end = cfg.end ?? '17:30';

        return (
          <DayRow
            key={day}
            day={day}
            enabled={cfg.enabled}
            start={start}
            end={end}
            isToday={day === today}
            disabled={disabled}
            onToggle={(enabled) => setDayEnabled(day, enabled)}
            onUpdate={(patch) => updateDay(day, patch)}
          />
        );
      })}
    </div>
  );
}
