'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2 } from 'lucide-react';
import type { BuilderFieldRow } from '@/types/ticketForm';
import {
  BUILDER_INLINE_INPUT_CLASS,
  builderFieldRowBorderClass,
  fieldTypeNeedsOptions,
  optionsHintForType,
} from './constants';
import FieldCardPreview from './FieldCardPreview';
import FieldOptionsEditor from './FieldOptionsEditor';
import FieldConfigEditor from './FieldConfigEditor';
import FormFieldError from './FormFieldError';
import RequiredToggle from './RequiredToggle';

interface Props {
  row: BuilderFieldRow;
  onChange: (clientId: string, patch: Partial<BuilderFieldRow>) => void;
  onRemove?: (clientId: string) => void;
  onSelect?: () => void;
  error?: string;
  selected?: boolean;
  isFirst?: boolean;
  prevSelected?: boolean;
  rowRef?: (el: HTMLDivElement | null) => void;
}

const titleInputClass = `${BUILDER_INLINE_INPUT_CLASS} w-full text-sm font-semibold uppercase tracking-wider text-gray-900 placeholder:font-medium placeholder:uppercase placeholder:tracking-wider placeholder:text-gray-400`;

const descriptionInputClass = `${BUILDER_INLINE_INPUT_CLASS} mt-1 w-full pb-0 text-xs text-gray-500 placeholder:text-gray-400`;

export default function SortableFieldRow({
  row,
  onChange,
  onRemove,
  onSelect,
  error,
  selected = false,
  isFirst = false,
  prevSelected = false,
  rowRef,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.clientId,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const showOptions = fieldTypeNeedsOptions(row.field_type);
  const optionsHint = optionsHintForType(row.field_type);
  const requiredLocked =
    row.isSystem && ['summary', 'project', 'work_type'].includes(row.field_key);

  const borderClass = builderFieldRowBorderClass(selected, isFirst, prevSelected);

  return (
    <div
      ref={(el) => {
        setNodeRef(el);
        rowRef?.(el);
      }}
      style={style}
      onClick={() => onSelect?.()}
      className={`cursor-pointer px-4 py-5 transition-colors sm:px-8 ${borderClass}`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          className="mt-0.5 shrink-0 cursor-grab text-gray-500 hover:text-gray-700 active:cursor-grabbing"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="min-w-0">
            <div className="flex items-center gap-0.5">
              <input
                type="text"
                value={row.label}
                onChange={(e) => onChange(row.clientId, { label: e.target.value })}
                className={titleInputClass}
                placeholder="Field label"
              />
              {row.is_required && (
                <span className="shrink-0 text-sm font-medium uppercase tracking-wider text-rose-900">
                  *
                </span>
              )}
            </div>

            <input
              type="text"
              value={row.help_text ?? ''}
              onChange={(e) => onChange(row.clientId, { help_text: e.target.value })}
              className={descriptionInputClass}
              placeholder="Add a description"
            />
          </div>

          <FieldCardPreview fieldType={row.field_type} />

          {showOptions && (
            <div className="mt-3 flex flex-col gap-1">
              {optionsHint && <p className="text-xs text-gray-500">{optionsHint}</p>}
              <FieldOptionsEditor
                options={row.options ?? []}
                onChange={(options) => onChange(row.clientId, { options })}
              />
            </div>
          )}

          {!row.isSystem && (
            <FieldConfigEditor row={row} onChange={(patch) => onChange(row.clientId, patch)} />
          )}

          <FormFieldError message={error} />

          <div className="mt-2 flex items-center justify-between gap-2 pt-2">
            <RequiredToggle
              checked={row.is_required}
              disabled={requiredLocked}
              onChange={(is_required) => onChange(row.clientId, { is_required })}
            />
            {!row.isSystem && onRemove && (
              <button
                type="button"
                onClick={() => onRemove(row.clientId)}
                className="shrink-0 rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                aria-label="Remove from form"
                title="Returns field to palette"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
