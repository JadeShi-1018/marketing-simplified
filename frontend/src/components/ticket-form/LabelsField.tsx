'use client';

import type { FieldOption } from '@/types/ticketForm';

interface Props {
  options: FieldOption[];
  selected: string[];
  disabled?: boolean;
  onChange: (next: string[]) => void;
}

export default function LabelsField({ options, selected, disabled, onChange }: Props) {
  const toggle = (value: string) => {
    if (disabled) return;
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = selected.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => toggle(opt.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              active
                ? 'bg-[#86E9A8] text-gray-900'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
