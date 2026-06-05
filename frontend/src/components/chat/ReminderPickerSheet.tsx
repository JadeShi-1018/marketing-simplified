'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { CalendarClock, ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ReminderPickerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (time: Date) => void;
}

const BRAND_BUTTON_CLASS =
  'bg-[#3CCED7] text-white border-transparent shadow-sm hover:bg-[#2dbbc4]';

const quickOptions = [
  { label: 'In 30 min', minutes: 30 },
  { label: 'In 1 hour', minutes: 60 },
  { label: 'In 2 hours', minutes: 120 },
  { label: 'In 1 day', minutes: 1440 },
];

export default function ReminderPickerSheet({
  open,
  onOpenChange,
  onConfirm,
}: ReminderPickerSheetProps) {
  const [selectedTime, setSelectedTime] = useState<Date>(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 60); // Default: 1 hour later
    return now;
  });
  const [activeButton, setActiveButton] = useState<string>('In 1 hour');
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  // Handle animation states
  useEffect(() => {
    if (open) {
      setIsAnimating(true);
    }
  }, [open]);

  const handleQuickSelect = (minutes: number, label: string) => {
    const newTime = new Date();
    newTime.setMinutes(newTime.getMinutes() + minutes);
    setSelectedTime(newTime);
    setActiveButton(label);
    setShowCustomPicker(false);
  };

  const handleCustomTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value) {
      const newTime = new Date(value);
      setSelectedTime(newTime);
      setActiveButton(''); // Clear quick button selection
    }
  };

  const handleConfirm = () => {
    onConfirm(selectedTime);
  };

  const handleClose = () => {
    setIsAnimating(false);
    setTimeout(() => onOpenChange(false), 300); // Wait for animation
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  const formatDisplayTime = (date: Date) => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const isToday = date.toDateString() === now.toDateString();
    const isTomorrow = date.toDateString() === tomorrow.toDateString();

    const weekday = format(date, 'EEEE');
    const time = format(date, 'HH:mm');

    if (isToday) {
      return `Today ${time}`;
    } else if (isTomorrow) {
      return `Tomorrow ${time}`;
    } else {
      return `${format(date, 'MMM dd')} ${weekday} ${time}`;
    }
  };

  if (!open && !isAnimating) return null;

  return (
    <>
      <div
        className={cn(
          'absolute inset-0 z-[100] flex items-center justify-center bg-black/30 p-4 transition-opacity duration-200',
          isAnimating && open ? 'opacity-100' : 'opacity-0'
        )}
        onClick={handleOverlayClick}
      >
        <div
          className={cn(
            'w-full max-w-[440px] rounded-xl border border-gray-200 bg-white p-5 shadow-xl',
            'transition-all duration-200 ease-out',
            isAnimating && open ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-2 scale-95 opacity-0'
          )}
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#E9FBFA] text-[#0F8E95]">
                <CalendarClock className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-gray-900">Set reminder</h2>
                <p className="text-xs text-gray-500">Choose when this should come back.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
              aria-label="Close reminder picker"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <button
            type="button"
            className="mb-3 flex w-full items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-left transition-colors hover:bg-gray-100"
            onClick={() => setShowCustomPicker(!showCustomPicker)}
          >
            <span>
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Reminder time
              </span>
              <span className="block text-sm font-semibold text-gray-900">
                {formatDisplayTime(selectedTime)}
              </span>
            </span>
            <ChevronDown
              className={cn(
                'h-4 w-4 text-gray-500 transition-transform',
                showCustomPicker && 'rotate-180'
              )}
            />
          </button>

          {showCustomPicker && (
            <div className="mb-3">
              <input
                type="datetime-local"
                value={format(selectedTime, "yyyy-MM-dd'T'HH:mm")}
                onChange={handleCustomTimeChange}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3CCED7]/40"
                min={format(new Date(), "yyyy-MM-dd'T'HH:mm")}
              />
            </div>
          )}

          <div className="mb-5 grid grid-cols-2 gap-2">
            {quickOptions.map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => handleQuickSelect(option.minutes, option.label)}
                className={cn(
                  'rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors',
                  activeButton === option.label
                    ? 'border-[#3CCED7] bg-[#E9FBFA] text-[#0F7F86]'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-[#3CCED7] hover:bg-gray-50'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className={cn(
                'rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors',
                BRAND_BUTTON_CLASS
              )}
            >
              Set reminder
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
