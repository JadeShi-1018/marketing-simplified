'use client';

import * as Popover from '@radix-ui/react-popover';
import { ChevronDown, X, XCircle } from 'lucide-react';
import { useState, type MouseEvent } from 'react';
import type { PortalSelectOption } from './PortalSelect';

interface Props {
  id?: string;
  values: string[];
  options: PortalSelectOption[];
  disabled?: boolean;
  placeholder?: string;
  onChange: (values: string[]) => void;
}

const triggerOpenClass = 'border-green-600 ring-2 ring-green-600/30';
const triggerClosedClass = 'border-gray-300';

export default function PortalMultiSelect({
  id,
  values,
  options,
  disabled,
  placeholder = 'Select...',
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);

  const selectedOptions = options.filter((opt) => values.includes(opt.value));

  const toggle = (optionValue: string) => {
    if (disabled) return;
    if (values.includes(optionValue)) {
      onChange(values.filter((v) => v !== optionValue));
    } else {
      onChange([...values, optionValue]);
    }
  };

  const remove = (optionValue: string, e: MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    onChange(values.filter((v) => v !== optionValue));
  };

  const clearAll = (e: MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    onChange([]);
  };

  return (
    <Popover.Root
      open={disabled ? false : open}
      onOpenChange={(next) => {
        if (!disabled) setOpen(next);
      }}
    >
      <Popover.Trigger asChild>
        <div
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          tabIndex={disabled ? -1 : 0}
          className={`flex min-h-[40px] w-full cursor-pointer items-center justify-between gap-2 rounded border bg-white px-2 py-1.5 text-sm transition focus:outline-none ${
            disabled ? 'cursor-not-allowed opacity-50' : ''
          } ${open ? triggerOpenClass : triggerClosedClass}`}
        >
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {selectedOptions.length === 0 ? (
              <span className="px-1 text-gray-500">{placeholder}</span>
            ) : (
              selectedOptions.map((opt) => (
                <span
                  key={opt.value}
                  className="inline-flex max-w-full items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-sm text-gray-900"
                >
                  <span className="truncate">{opt.label}</span>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={(e) => remove(opt.value, e)}
                    className="shrink-0 rounded text-gray-500 hover:text-gray-900 disabled:opacity-50"
                    aria-label={`Remove ${opt.label}`}
                  >
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                </span>
              ))
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1 pr-0.5">
            {values.length > 0 && (
              <button
                type="button"
                disabled={disabled}
                onClick={clearAll}
                className="rounded p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-50"
                aria-label="Clear all selections"
              >
                <XCircle className="h-4 w-4" aria-hidden />
              </button>
            )}
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${
                open ? 'rotate-180' : ''
              }`}
              aria-hidden
            />
          </div>
        </div>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          sideOffset={4}
          align="start"
          className="z-[200] overflow-hidden rounded-md border border-gray-200 bg-white shadow-md"
          style={{ width: 'var(--radix-popover-trigger-width)' }}
        >
          <ul role="listbox" aria-multiselectable="true" className="max-h-60 overflow-y-auto py-1">
            {options.map((opt) => {
              const isSelected = values.includes(opt.value);
              return (
                <li key={opt.value} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => toggle(opt.value)}
                    className={`group relative flex w-full items-center gap-2.5 py-2.5 pl-4 pr-3 text-left text-sm text-gray-900 transition hover:bg-gray-100 focus:bg-gray-100 focus:outline-none ${
                      isSelected ? 'bg-gray-100' : ''
                    }`}
                  >
                    <span
                      className={`absolute left-0 top-0 h-full w-1 bg-green-600 ${
                        isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                      aria-hidden
                    />
                    <input
                      type="checkbox"
                      checked={isSelected}
                      readOnly
                      tabIndex={-1}
                      className="h-4 w-4 shrink-0 rounded border-gray-300"
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
