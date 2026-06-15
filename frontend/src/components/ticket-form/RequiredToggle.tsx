'use client';

import { Check, X } from 'lucide-react';

interface Props {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

export default function RequiredToggle({ checked, disabled = false, onChange }: Props) {
  return (
    <div
      className={`flex items-center gap-2 ${disabled ? 'opacity-50' : ''}`}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label="Required"
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-300 ease-in-out focus:outline-none focus-visible:ring-2 focus:ring-indigo-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed ${
          checked ? 'bg-gradient-to-r from-[#3CCED7] to-[#A6E661]' : 'bg-gray-800'
        }`}
      >
        <span
          className={`pointer-events-none absolute flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white shadow-sm transition-[left] duration-300 ease-in-out ${
            checked ? 'left-[18px]' : 'left-0.5'
          }`}
        />
        {checked ? (
          <Check
            className="pointer-events-none absolute left-1 h-2.5 w-2.5 text-white transition-opacity duration-300 ease-in-out"
            strokeWidth={2.5}
            aria-hidden
          />
        ) : (
          <X
            className="pointer-events-none absolute right-1 h-2.5 w-2.5 text-white/90 transition-opacity duration-300 ease-in-out"
            strokeWidth={2.5}
            aria-hidden
          />
        )}
      </button>
      <span className={`text-xs text-gray-700 ${disabled ? 'cursor-not-allowed' : ''}`}>
        Required
      </span>
    </div>
  );
}
