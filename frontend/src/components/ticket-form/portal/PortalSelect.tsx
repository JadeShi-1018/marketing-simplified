'use client';

import * as Popover from '@radix-ui/react-popover';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

export interface PortalSelectOption {
  value: string;
  label: string;
}

interface Props {
  id?: string;
  value: string;
  options: PortalSelectOption[];
  disabled?: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
}

const triggerOpenClass = 'border-green-600 ring-2 ring-green-600/30';
const triggerClosedClass = 'border-gray-300';

export default function PortalSelect({
  id,
  value,
  options,
  disabled,
  placeholder = 'Select...',
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={`flex min-h-[40px] w-full items-center justify-between rounded border bg-white px-3 py-2 text-sm transition focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
            open ? triggerOpenClass : triggerClosedClass
          }`}
        >
          <span className={`truncate ${selected ? 'text-gray-900' : 'text-gray-500'}`}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${
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
          <ul role="listbox" className="max-h-60 overflow-y-auto py-1">
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <li key={opt.value} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    className={`group relative flex w-full items-center py-2.5 pl-4 pr-3 text-left text-sm text-gray-900 transition hover:bg-gray-100 focus:bg-gray-100 focus:outline-none ${
                      isSelected ? 'bg-gray-100' : ''
                    }`}
                  >
                    <span
                      className={`absolute left-0 top-0 h-full w-1 bg-green-600 ${
                        isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                      aria-hidden
                    />
                    <span>{opt.label}</span>
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
