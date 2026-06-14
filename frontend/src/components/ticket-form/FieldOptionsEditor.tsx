'use client';

import type { FieldOption } from '@/types/ticketForm';
import { Plus, Trash2 } from 'lucide-react';

interface Props {
  options: FieldOption[];
  onChange: (next: FieldOption[]) => void;
  disabled?: boolean;
}

export default function FieldOptionsEditor({ options, onChange, disabled }: Props) {
  const update = (index: number, patch: Partial<FieldOption>) => {
    onChange(options.map((opt, i) => (i === index ? { ...opt, ...patch } : opt)));
  };

  const setOptionText = (index: number, text: string) => {
    update(index, { value: text, label: text });
  };

  const add = () => onChange([...options, { value: '', label: '' }]);

  const remove = (index: number) => onChange(options.filter((_, i) => i !== index));

  const inputClass =
    'flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#86E9A8] focus:ring-2 focus:ring-[#86E9A8] focus:ring-offset-1';

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-gray-600">Options</p>
        <button
          type="button"
          disabled={disabled}
          onClick={add}
          className="rounded p-1 text-gray-500 hover:bg-gray-200 hover:text-gray-700 disabled:opacity-50"
          aria-label="Add option"
          title="Add option"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {options.map((opt, index) => (
        <div key={index} className="flex items-center gap-1.5">
          <label className="flex min-w-0 flex-1 items-center gap-1">
            <span className="shrink-0 text-xs font-medium text-gray-600">Option</span>
            <input
              type="text"
              placeholder="Option 1"
              value={opt.label || opt.value}
              disabled={disabled}
              onChange={(e) => setOptionText(index, e.target.value)}
              className={inputClass}
            />
          </label>
          <button
            type="button"
            disabled={disabled}
            onClick={() => remove(index)}
            className="rounded p-1 text-gray-400 hover:text-red-600"
            aria-label="Remove option"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
