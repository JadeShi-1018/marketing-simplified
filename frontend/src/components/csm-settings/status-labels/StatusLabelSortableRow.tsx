'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Pencil, Trash2 } from 'lucide-react';
import type { CustomerStatusLabel } from '@/types/customer';
import StatusLabelBadge from './StatusLabelBadge';

interface Props {
  row: CustomerStatusLabel;
  onEdit: (row: CustomerStatusLabel) => void;
  onDelete: (row: CustomerStatusLabel) => void;
  deleting: boolean;
}

export default function StatusLabelSortableRow({ row, onEdit, onDelete, deleting }: Props) {
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

      <StatusLabelBadge name={row.name} color={row.color} />

      <span className="flex-1" />

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
        <button
          type="button"
          onClick={() => onDelete(row)}
          disabled={deleting}
          title="Delete"
          aria-label={`Delete ${row.name}`}
          className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
