'use client';

import { useDraggable } from '@dnd-kit/core';
import { GripVertical } from 'lucide-react';
import type { BuilderFieldRow } from '@/types/ticketForm';
import { BUILDER_SELECTION_RING_CLASS, paletteDragId } from './constants';
import FieldTypeIcon from './FieldTypeIcon';

interface Props {
  row: BuilderFieldRow;
  selected: boolean;
  onSelect: () => void;
  overlay?: boolean;
}

export default function PaletteFieldCard({
  row,
  selected,
  onSelect,
  overlay = false,
}: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: paletteDragId(row.clientId),
    data: { type: 'palette', clientId: row.clientId },
    disabled: overlay,
  });

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      className={`rounded-lg border border-gray-200 bg-white px-3 py-2.5 ${
        overlay ? 'shadow-md' : ''
      } ${selected ? BUILDER_SELECTION_RING_CLASS : ''} ${
        isDragging && !overlay ? 'opacity-60' : ''
      }`}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="shrink-0 cursor-grab text-gray-500 hover:text-gray-700 active:cursor-grabbing"
          aria-label="Drag to form canvas"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={onSelect}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <FieldTypeIcon fieldType={row.field_type} />
          <span className="truncate text-sm font-medium text-gray-900">{row.label}</span>
        </button>
      </div>
    </div>
  );
}
