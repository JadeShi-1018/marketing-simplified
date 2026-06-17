'use client';

import { useDraggable } from '@dnd-kit/core';
import { GripVertical } from 'lucide-react';
import type { FieldType } from '@/types/ticketForm';
import { fieldTypeDragId } from './constants';
import FieldTypeIcon from './FieldTypeIcon';

interface Props {
  fieldType: FieldType;
  label: string;
  selected?: boolean;
  onSelect: () => void;
  overlay?: boolean;
}

export default function FieldTypePaletteCard({
  fieldType,
  label,
  selected = false,
  onSelect,
  overlay = false,
}: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: fieldTypeDragId(fieldType),
    data: { type: 'field-type', fieldType },
    disabled: overlay,
  });

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      className={`group rounded-lg border-2 bg-white px-3 py-2 shadow-[0_4px_14px_-10px_rgba(15,23,42,0.3)] transition-colors ${
        selected
          ? 'border-[#86E9A8]'
          : 'border-gray-200 hover:border-[#86E9A8] focus-within:border-[#86E9A8]'
      } ${overlay ? 'shadow-[0_6px_16px_-6px_rgba(15,23,42,0.14)]' : ''} ${
        isDragging && !overlay ? 'opacity-60' : ''
      }`}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="shrink-0 cursor-grab text-gray-500 hover:text-gray-700 active:cursor-grabbing"
          aria-label={`Drag ${label} onto form`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={onSelect}
          aria-pressed={selected}
          className="group flex min-w-0 flex-1 items-center gap-2 rounded-md text-left outline-none"
        >
          <FieldTypeIcon 
            fieldType={fieldType} 
            className={`transition-colors ${
              selected ? 'text-gray-900' : 'text-gray-500 group-focus:text-gray-900'
            }`}  
          />
          <span
            className={`truncate text-sm font-medium transition-colors ${
              selected ? 'text-gray-900' : 'text-gray-500 group-focus:text-gray-900'
            }`}
          >
            {label}
          </span>
        </button>
      </div>
    </div>
  );
}
