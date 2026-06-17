'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { TicketFormAPI } from '@/lib/api/ticketFormApi';
import type { CsmWorkTypeStub } from '@/types/ticketForm';
import WorkTypeSortableRow from './WorkTypeSortableRow';

interface Props {
  projectId: number;
  items: CsmWorkTypeStub[];
  onChange: (items: CsmWorkTypeStub[]) => void;
  onEdit: (row: CsmWorkTypeStub) => void;
  onDeactivate: (row: CsmWorkTypeStub) => void;
}

export default function WorkTypesSortableList({
  projectId,
  items,
  onChange,
  onEdit,
  onDeactivate,
}: Props) {
  const [savingOrder, setSavingOrder] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || savingOrder) return;

    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const previous = items;
    const reordered = arrayMove(items, oldIndex, newIndex);
    onChange(reordered);

    setSavingOrder(true);
    try {
      await TicketFormAPI.reorderWorkTypes(
        projectId,
        reordered.map((r) => r.id),
      );
      toast.success('Work type order saved.');
    } catch {
      onChange(previous);
      toast.error('Could not save order.');
    } finally {
      setSavingOrder(false);
    }
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2">
          {items.map((row) => (
            <WorkTypeSortableRow
              key={row.id}
              row={row}
              onEdit={onEdit}
              onDeactivate={onDeactivate}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
