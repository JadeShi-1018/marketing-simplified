'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Ban, GripVertical, Pencil } from 'lucide-react';
import type { CsmWorkTypeStub } from '@/types/ticketForm';
import StatusBadge from './StatusBadge';

interface Props {
  row: CsmWorkTypeStub;
  onEdit: (row: CsmWorkTypeStub) => void;
  onDeactivate: (row: CsmWorkTypeStub) => void;
}

export default function WorkTypeSortableRow({ row, onEdit, onDeactivate }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 max-sm:flex-col max-sm:items-start ${
        isDragging ? 'opacity-60' : ''
      }`}
    >
      <button
        type="button"
        className="cursor-grab p-2 text-gray-400 hover:text-gray-600 active:cursor-grabbing"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" aria-hidden />
      </button>

      <span className="flex-1 text-sm font-medium text-gray-900">{row.name}</span>

      <StatusBadge
        active={row.is_active}
        inactiveLabel="Inactive"
      />

      <div className="flex items-center gap-2 max-sm:w-full max-sm:justify-end">
        <button
          type="button"
          onClick={() => onEdit(row)}
          title="Edit"
          aria-label={`Edit ${row.name}`}
          className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
        >
          <Pencil className="h-4 w-4" aria-hidden />
        </button>
        {row.is_active && (
          <button
            type="button"
            onClick={() => onDeactivate(row)}
            title="Deactivate"
            aria-label={`Deactivate ${row.name}`}
            className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
          >
            <Ban className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
