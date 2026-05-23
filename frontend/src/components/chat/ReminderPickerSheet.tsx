'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ReminderPickerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (time: Date) => void;
}

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
      {/* Overlay */}
      <div
        className={cn(
          'absolute inset-0 bg-black/30 z-[100] transition-opacity duration-300',
          isAnimating && open ? 'opacity-100' : 'opacity-0'
        )}
        onClick={handleOverlayClick}
      />

      {/* Sheet */}
      <div
        className={cn(
          'absolute bottom-0 left-0 right-0 z-[101]',
          'w-full rounded-t-2xl bg-white border-t border-gray-200',
          'p-6 shadow-lg',
          'transition-transform duration-300 ease-out',
          isAnimating && open ? 'translate-y-0' : 'translate-y-full'
        )}
      >
        {/* Title */}
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Set Reminder Time</h2>
        </div>

        {/* Time Display - Clickable */}
        <div
          className="flex items-center justify-between py-4 px-4 bg-gray-50 rounded-lg cursor-pointer mb-4"
          onClick={() => setShowCustomPicker(!showCustomPicker)}
        >
          <span className="text-base font-medium text-gray-900">
            {formatDisplayTime(selectedTime)}
          </span>
          <ChevronDown
            className={cn(
              'w-5 h-5 text-gray-500 transition-transform',
              showCustomPicker && 'rotate-180'
            )}
          />
        </div>

        {/* Custom Time Picker */}
        {showCustomPicker && (
          <div className="mb-4">
            <input
              type="datetime-local"
              value={format(selectedTime, "yyyy-MM-dd'T'HH:mm")}
              onChange={handleCustomTimeChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              min={format(new Date(), "yyyy-MM-dd'T'HH:mm")}
            />
          </div>
        )}

        {/* Quick Options */}
        <div className="grid grid-cols-4 gap-2 mb-6">
          {quickOptions.map((option) => (
            <button
              key={option.label}
              onClick={() => handleQuickSelect(option.minutes, option.label)}
              className={cn(
                'py-3 px-2 rounded-lg border text-sm font-medium transition-all',
                activeButton === option.label
                  ? 'bg-green-500 text-white border-green-500'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-green-500'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleClose}
            className="flex-1 py-3 px-4 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 py-3 px-4 rounded-lg bg-green-500 text-white font-medium hover:bg-green-600 transition-colors"
          >
            Set
          </button>
        </div>
      </div>
    </>
  );
}
