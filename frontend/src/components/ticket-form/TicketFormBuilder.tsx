'use client';

import { useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { TicketFormAPI } from '@/lib/api/ticketFormApi';
import type { BuilderFieldRow, FieldType, TicketFormField } from '@/types/ticketForm';
import {
  CANVAS_CUSTOM_DROP_ID,
  MAX_FILE_SIZE_MB,
  MAX_FILES_PER_SUBMISSION,
  SHORT_TEXT_MAX_LENGTH,
  SYSTEM_FIELD_KEYS,
  builderRowFromFieldType,
  defaultLabelForType,
  fieldKeyFromLabel,
  fieldTypeLabel,
  fieldTypeNeedsOptions,
  getFieldNameConflict,
  normalizeFieldOptions,
  parseFieldTypeDragId,
  parsePaletteClientId,
  rowErrorKey,
} from './constants';
import TicketFormBuilderLayout from './TicketFormBuilderLayout';
import FormCanvas from './FormCanvas';
import FieldsPanel from './FieldsPanel';
import PaletteFieldCard from './PaletteFieldCard';
import FieldTypePaletteCard from './FieldTypePaletteCard';
import { parseFieldErrors } from './formErrors';

/** Palette / field-type drags must land with the pointer inside a droppable (canvas). */
const builderCollisionDetection: CollisionDetection = (args) => {
  const activeId = String(args.active.id);
  const isExternalDrag =
    activeId.startsWith('field-type-') || activeId.startsWith('palette-');

  if (isExternalDrag) {
    return pointerWithin(args);
  }

  return closestCenter(args);
};

function toBuilderRow(field: TicketFormField): BuilderFieldRow {
  return {
    ...field,
    clientId: field.id ? `field-${field.id}` : `key-${field.field_key}`,
    isSystem: SYSTEM_FIELD_KEYS.has(field.field_key),
    options: field.options ?? [],
  };
}

function toPayload(rows: BuilderFieldRow[]): TicketFormField[] {
  return rows.map((row, index) => ({
    field_key: row.isSystem ? row.field_key : fieldKeyFromLabel(row.label),
    label: row.label.trim(),
    field_type: row.field_type,
    is_required: row.is_required,
    sort_order: index,
    options: fieldTypeNeedsOptions(row.field_type)
      ? normalizeFieldOptions(row.options ?? [])
      : [],
    field_config:
      row.field_type === 'short_text'
        ? { max_length: SHORT_TEXT_MAX_LENGTH }
        : (row.field_config ?? {}),
    help_text: row.help_text ?? '',
    max_files: row.field_type === 'file' ? MAX_FILES_PER_SUBMISSION : (row.max_files ?? 10),
    max_file_size_mb: row.field_type === 'file' ? MAX_FILE_SIZE_MB : (row.max_file_size_mb ?? 25),
  }));
}

function validateRows(rows: BuilderFieldRow[]): Record<string, string> {
  const errors: Record<string, string> = {};
  rows.forEach((row) => {
    const errorKey = rowErrorKey(row);
    const nameConflict = getFieldNameConflict(row.label, rows, row.clientId);
    if (nameConflict) {
      errors[errorKey] = nameConflict;
      return;
    }
    if (fieldTypeNeedsOptions(row.field_type)) {
      if (normalizeFieldOptions(row.options ?? []).length === 0) {
        errors[errorKey] = 'Add at least one option with a label.';
      }
    }
  });
  return errors;
}

interface Props {
  formId: number;
  projectId: number;
  formName: string;
  formDescription: string;
  onFormNameChange: (name: string) => void;
  onFormDescriptionChange: (description: string) => void;
  onSaveMetadata: () => void | Promise<void>;
  onDeleteForm: () => void | Promise<void>;
  initialFields: TicketFormField[];
  onSaved?: () => void;
}

export default function TicketFormBuilder({
  formId,
  projectId,
  formName,
  formDescription,
  onFormNameChange,
  onFormDescriptionChange,
  onSaveMetadata,
  onDeleteForm,
  initialFields,
  onSaved,
}: Props) {
  const [canvasRows, setCanvasRows] = useState<BuilderFieldRow[]>(() =>
    [...initialFields]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(toBuilderRow),
  );
  const [paletteFields, setPaletteFields] = useState<BuilderFieldRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [selectedFieldKey, setSelectedFieldKey] = useState<string | null>(null);
  const [selectedPaletteClientId, setSelectedPaletteClientId] = useState<string | null>(null);
  const [selectedFieldType, setSelectedFieldType] = useState<FieldType | null>(null);
  const [activePaletteRow, setActivePaletteRow] = useState<BuilderFieldRow | null>(null);
  const [activeFieldType, setActiveFieldType] = useState<FieldType | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const allBuilderRows = useMemo(
    () => [...canvasRows, ...paletteFields],
    [canvasRows, paletteFields],
  );

  const selectCanvasField = (fieldKey: string) => {
    setSelectedFieldKey(fieldKey);
    setSelectedPaletteClientId(null);
    setSelectedFieldType(null);
  };

  const focusField = (fieldKey: string) => {
    selectCanvasField(fieldKey);
    requestAnimationFrame(() => {
      rowRefs.current[fieldKey]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  };

  const insertOnCanvas = (field: BuilderFieldRow, overId: string | number) => {
    setCanvasRows((prev) => {
      let insertIndex = prev.length;
      if (overId !== CANVAS_CUSTOM_DROP_ID) {
        const overIndex = prev.findIndex((r) => r.clientId === overId);
        if (overIndex >= 0) insertIndex = overIndex;
      }
      const next = [...prev];
      next.splice(insertIndex, 0, field);
      return next.map((r, i) => ({ ...r, sort_order: i }));
    });
    focusField(field.field_key);
  };

  const addFieldFromType = (fieldType: FieldType, overId: string | number = CANVAS_CUSTOM_DROP_ID) => {
    const label = defaultLabelForType(fieldType, allBuilderRows);
    const field = builderRowFromFieldType(fieldType, label);
    insertOnCanvas(field, overId);
    setSelectedFieldType(fieldType);
    setSelectedPaletteClientId(null);
  };

  const placePaletteOnCanvas = (clientId: string, overId: string | number) => {
    const field = paletteFields.find((r) => r.clientId === clientId);
    if (!field) return;

    setPaletteFields((prev) => prev.filter((r) => r.clientId !== clientId));
    insertOnCanvas(field, overId);
    setSelectedPaletteClientId(null);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const paletteClientId = parsePaletteClientId(event.active.id);
    if (paletteClientId) {
      const row = paletteFields.find((r) => r.clientId === paletteClientId);
      setActivePaletteRow(row ?? null);
      return;
    }

    const fieldType = parseFieldTypeDragId(event.active.id);
    if (fieldType) {
      setActiveFieldType(fieldType);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActivePaletteRow(null);
    setActiveFieldType(null);
    const { active, over } = event;
    if (!over) return;

    const paletteClientId = parsePaletteClientId(active.id);
    if (paletteClientId) {
      const overCanvasRow = canvasRows.some((r) => r.clientId === over.id);
      if (over.id === CANVAS_CUSTOM_DROP_ID || overCanvasRow) {
        placePaletteOnCanvas(paletteClientId, over.id);
      }
      return;
    }

    const fieldType = parseFieldTypeDragId(active.id);
    if (fieldType) {
      const overCanvasRow = canvasRows.some((r) => r.clientId === over.id);
      if (over.id === CANVAS_CUSTOM_DROP_ID || overCanvasRow) {
        addFieldFromType(fieldType, over.id);
      }
      return;
    }

    if (active.id === over.id) return;
    const oldIndex = canvasRows.findIndex((r) => r.clientId === active.id);
    const newIndex = canvasRows.findIndex((r) => r.clientId === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    setCanvasRows(
      arrayMove(canvasRows, oldIndex, newIndex).map((r, i) => ({ ...r, sort_order: i })),
    );
  };

  const patchRow = (clientId: string, patch: Partial<BuilderFieldRow>) => {
    setCanvasRows((prev) =>
      prev.map((r) => {
        if (r.clientId !== clientId) return r;
        const next = { ...r, ...patch };
        if (patch.label !== undefined && !r.isSystem) {
          next.field_key = fieldKeyFromLabel(patch.label);
        }
        return next;
      }),
    );
    setFieldErrors((prev) => {
      const row = canvasRows.find((r) => r.clientId === clientId);
      if (!row) return prev;
      const next = { ...prev };
      delete next[row.field_key];
      if (!row.isSystem) {
        delete next[fieldKeyFromLabel(row.label)];
      }
      return next;
    });
  };

  const removeFromCanvas = (clientId: string) => {
    const removed = canvasRows.find((r) => r.clientId === clientId);
    if (!removed || removed.isSystem) return;

    setCanvasRows((prev) =>
      prev.filter((r) => r.clientId !== clientId).map((r, i) => ({ ...r, sort_order: i })),
    );
    setPaletteFields((prev) => [...prev, removed]);
    if (selectedFieldKey === removed.field_key) {
      setSelectedFieldKey(null);
    }
    setSelectedPaletteClientId(removed.clientId);
    setSelectedFieldType(null);
  };

  const handleSelectFieldType = (fieldType: FieldType) => {
    setSelectedFieldType(fieldType);
    setSelectedPaletteClientId(null);
  };

  const handleSaveForm = async () => {
    const clientErrors = validateRows(canvasRows);
    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      toast.error('Fix the highlighted fields before saving.');
      return;
    }

    setSaving(true);
    setFieldErrors({});
    try {
      await onSaveMetadata();
      await TicketFormAPI.bulkFields(formId, { fields: toPayload(canvasRows) });
      toast.success('Form saved.');
      onSaved?.();
    } catch (err: unknown) {
      const data = (err as { response?: { data?: unknown } })?.response?.data;
      const mapped = parseFieldErrors(data);
      if (Object.keys(mapped).length > 0) {
        setFieldErrors(mapped);
      }
      const firstMessage = Object.values(mapped)[0];
      toast.error(firstMessage ?? 'Could not save form.');
    } finally {
      setSaving(false);
    }
  };

  const isExternalDragActive = activePaletteRow !== null || activeFieldType !== null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={builderCollisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <TicketFormBuilderLayout
          canvas={
            <FormCanvas
              formId={formId}
              projectId={projectId}
              formName={formName}
              formDescription={formDescription}
              onFormNameChange={onFormNameChange}
              onFormDescriptionChange={onFormDescriptionChange}
              onSaveMetadata={onSaveMetadata}
              rows={canvasRows}
              selectedFieldKey={selectedFieldKey}
              onSelectField={selectCanvasField}
              rowRefs={rowRefs}
              fieldErrors={fieldErrors}
              saving={saving}
              isPaletteDragActive={isExternalDragActive}
              onPatchRow={patchRow}
              onRemoveRow={removeFromCanvas}
              onSaveForm={handleSaveForm}
              onDeleteForm={onDeleteForm}
            />
          }
          fieldsPanel={
            <FieldsPanel
              paletteFields={paletteFields}
              selectedClientId={selectedPaletteClientId}
              selectedFieldType={selectedFieldType}
              onSelectPaletteField={setSelectedPaletteClientId}
              onSelectFieldType={handleSelectFieldType}
            />
          }
        />

      <DragOverlay>
        {activePaletteRow ? (
          <div className="opacity-80">
            <PaletteFieldCard
              row={activePaletteRow}
              selected={false}
              overlay
              onSelect={() => {}}
            />
          </div>
        ) : activeFieldType ? (
          <div className="opacity-80">
            <FieldTypePaletteCard
              fieldType={activeFieldType}
              label={fieldTypeLabel(activeFieldType)}
              overlay
              onSelect={() => {}}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
