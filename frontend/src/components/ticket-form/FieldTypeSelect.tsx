'use client';

import * as Popover from '@radix-ui/react-popover';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import type { FieldType } from '@/types/ticketForm';
import { CUSTOM_FIELD_TYPE_OPTIONS } from './constants';
import FieldTypeIcon from './FieldTypeIcon';

interface Props {
  value: FieldType;
  onChange: (value: FieldType) => void;
}

const triggerOpenClass =
  'border-[#86E9A8] ring-2 ring-[#86E9A8]/40 ring-offset-1';
const triggerClosedClass =
  'border-gray-300 focus:border-[#86E9A8] focus:ring-2 focus:ring-[#86E9A8]/40 focus:ring-offset-1';

export default function FieldTypeSelect({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const selected = CUSTOM_FIELD_TYPE_OPTIONS.find((o) => o.value === value);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="Field type"
          aria-haspopup="listbox"
          aria-expanded={open}
          className={`flex w-full items-center justify-between rounded-lg border bg-white px-3 py-2 text-sm transition focus:outline-none ${
            open ? triggerOpenClass : triggerClosedClass
          }`}
        >
          <span
            className={`flex min-w-0 items-center gap-2 ${
              selected ? 'text-gray-900' : 'text-gray-400'
            }`}
          >
            {selected ? (
              <>
                <FieldTypeIcon fieldType={selected.value} />
                <span className="truncate">{selected.label}</span>
              </>
            ) : (
              'Select field type'
            )}
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${
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
          className="z-[200] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
          style={{ width: 'var(--radix-popover-trigger-width)' }}
        >
          <ul
            role="listbox"
            aria-label="Field type"
            className="dashboard-scrollbar max-h-60 overflow-y-auto py-1"
          >
            {CUSTOM_FIELD_TYPE_OPTIONS.map((opt) => {
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
                    className={`group relative flex w-full items-center gap-2.5 py-2.5 pl-4 pr-3 text-left text-sm text-gray-900 transition hover:bg-gray-50 focus:bg-gray-50 focus:outline-none ${
                      isSelected ? 'bg-gray-50' : ''
                    }`}
                  >
                    <span
                      className={`absolute left-0 top-0 h-full w-1 rounded-r-sm bg-[#86E9A8] ${
                        isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                      aria-hidden
                    />
                    <FieldTypeIcon fieldType={opt.value} />
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
