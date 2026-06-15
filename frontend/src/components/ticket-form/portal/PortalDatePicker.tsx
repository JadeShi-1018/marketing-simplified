'use client';

import * as Popover from '@radix-ui/react-popover';
import {
  addMonths,
  addYears,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isValid,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
  subYears,
} from 'date-fns';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { useEffect, useState } from 'react';

interface Props {
  id?: string;
  value: string;
  disabled?: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
}

const triggerOpenClass = 'border-green-600 ring-2 ring-green-600/30';
const triggerClosedClass = 'border-gray-300';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function parseValue(value: string): Date | null {
  if (!value) return null;
  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : null;
}

export default function PortalDatePicker({
  id,
  value,
  disabled,
  placeholder = 'Select date',
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = parseValue(value);
  const [viewMonth, setViewMonth] = useState<Date>(selected ?? new Date());

  useEffect(() => {
    if (open) setViewMonth(parseValue(value) ?? new Date());
  }, [open, value]);

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 0 }),
    end: endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 0 }),
  });

  const pick = (day: Date) => {
    onChange(format(day, 'yyyy-MM-dd'));
    setOpen(false);
  };

  return (
    <Popover.Root
      open={disabled ? false : open}
      onOpenChange={(next) => {
        if (!disabled) setOpen(next);
      }}
    >
      <Popover.Trigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          className={`flex min-h-[40px] w-full items-center justify-between rounded border bg-white px-3 py-2 text-sm transition focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
            open ? triggerOpenClass : triggerClosedClass
          }`}
        >
          <span className={`truncate ${selected ? 'text-gray-900' : 'text-gray-500'}`}>
            {selected ? format(selected, 'MMMM d, yyyy') : placeholder}
          </span>
          <Calendar className="h-4 w-4 shrink-0 text-gray-500" aria-hidden />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          sideOffset={4}
          align="start"
          className="z-[200] w-[280px] rounded-md border border-gray-200 bg-white p-3 shadow-md"
        >
          <div className="mb-3 flex items-center justify-between gap-1">
            <div className="flex items-center">
              <button
                type="button"
                onClick={() => setViewMonth((m) => subYears(m, 1))}
                className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Previous year"
              >
                <ChevronsLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMonth((m) => subMonths(m, 1))}
                className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>

            <span className="text-sm font-semibold text-gray-900">
              {format(viewMonth, 'MMMM yyyy')}
            </span>

            <div className="flex items-center">
              <button
                type="button"
                onClick={() => setViewMonth((m) => addMonths(m, 1))}
                className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMonth((m) => addYears(m, 1))}
                className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Next year"
              >
                <ChevronsRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mb-1 grid grid-cols-7 text-center text-xs font-medium text-gray-500">
            {WEEKDAYS.map((day) => (
              <span key={day} className="py-1">
                {day}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {days.map((day) => {
              const isSelected = selected ? isSameDay(day, selected) : false;
              const inMonth = isSameMonth(day, viewMonth);

              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => pick(day)}
                  className={`flex h-9 items-center justify-center text-sm transition ${
                    isSelected
                      ? 'font-semibold text-gray-900 underline decoration-2 underline-offset-4 decoration-green-600'
                      : inMonth
                        ? 'text-gray-800 hover:bg-gray-100'
                        : 'text-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {format(day, 'd')}
                </button>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
