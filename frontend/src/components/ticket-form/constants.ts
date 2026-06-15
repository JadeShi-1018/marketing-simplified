import type { BuilderFieldRow, FieldConfig, FieldOption, FieldType } from '@/types/ticketForm';

export const SYSTEM_FIELD_KEYS = new Set([
  'summary',
  'description',
  'project',
  'work_type',
]);

/** Primary action buttons — brand gradient (teal → lime). */
export const BUILDER_PRIMARY_BUTTON_CLASS =
  'inline-flex items-center gap-2 rounded-lg border border-transparent bg-gradient-to-br from-[#3CCED7] to-[#A6E661] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3CCED7]/60 focus-visible:ring-offset-1 disabled:opacity-50';

/** Secondary / navigation buttons — mint border (#86E9A8). */
export const BUILDER_OUTLINE_BUTTON_CLASS =
  'rounded-lg border border-[#86E9A8] bg-white px-4 py-2.5 text-sm font-medium text-gray-900 transition hover:bg-[#86E9A8]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#86E9A8]/60 focus-visible:ring-offset-1';

/** Selected palette / field card ring. */
export const BUILDER_SELECTION_RING_CLASS = 'ring-2 ring-[#86E9A8] ring-offset-1';

/** Mint divider color for selected canvas field rows. */
export const BUILDER_FIELD_ROW_SELECTED_DIVIDER_CLASS = 'border-[#86E9A8]';

/** Row dividers — title area owns the first row's top line when selected. */
export function builderFieldRowBorderClass(
  selected: boolean,
  isFirst: boolean,
  prevSelected: boolean,
): string {
  if (selected) {
    return isFirst
      ? `border-b ${BUILDER_FIELD_ROW_SELECTED_DIVIDER_CLASS}`
      : `border-t border-b ${BUILDER_FIELD_ROW_SELECTED_DIVIDER_CLASS}`;
  }
  if (isFirst || prevSelected) return '';
  return 'border-t border-gray-100';
}

/** Bordered inputs/selects in create panel and field config. */
export const BUILDER_CONTROL_CLASS =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#86E9A8] focus:ring-2 focus:ring-[#86E9A8]/40 focus:ring-offset-1';

/** Customer portal page — builder hat gradient header band. */
export const PORTAL_HEADER_GRADIENT_CLASS =
  'bg-gradient-to-r from-[#3CCED7] to-[#A6E661]';

/** Customer portal inputs (flat field stack). */
export const PORTAL_INPUT_CLASS =
  'w-full min-h-[40px] rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/30';

/** Customer portal primary submit button — matches Create task gradient. */
export const PORTAL_SUBMIT_BUTTON_CLASS =
  'inline-flex items-center justify-center rounded-md border border-transparent bg-gradient-to-br from-[#3CCED7] to-[#A6E661] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3CCED7]/60 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50';

/** Hover/focus highlight for inline builder text controls (label, help text, form title). */
export const BUILDER_INLINE_INPUT_CLASS =
  'rounded-md border-0 bg-transparent px-2 py-1 transition-colors enabled:hover:bg-gray-100 enabled:focus:bg-gray-100 focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50';

export const MAX_FILES_PER_SUBMISSION = 10;
export const MAX_FILE_SIZE_MB = 25;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
export const SHORT_TEXT_MAX_LENGTH = 255;

/** Custom field types available in the form builder (v1). */
export const CUSTOM_FIELD_TYPE_OPTIONS: { value: FieldType; label: string }[] = [
  { value: 'short_text', label: 'Single-line text' },
  { value: 'paragraph', label: 'Multi-line text' },
  { value: 'dropdown', label: 'Single-select dropdown' },
  { value: 'checkbox', label: 'Multi-select' },
  { value: 'date', label: 'Date picker' },
  { value: 'file', label: 'File attachment' },
];

const OPTION_FIELD_TYPES = new Set<FieldType>(['dropdown', 'checkbox']);

export function slugifyFieldKey(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 50) || 'custom_field';
}

/** Normalized display name for duplicate checks (trim + case-insensitive). */
export function normalizeFieldName(label: string): string {
  return label.trim().toLowerCase();
}

/** API/storage key derived from the field display name. */
export function fieldKeyFromLabel(label: string): string {
  return slugifyFieldKey(label);
}

function rowStorageKey(row: BuilderFieldRow): string {
  return row.isSystem ? row.field_key : fieldKeyFromLabel(row.label);
}

/** Key used for validation errors and API field_key on custom fields. */
export function rowErrorKey(row: BuilderFieldRow): string {
  return rowStorageKey(row);
}

/** Returns an error message when the name conflicts with an existing field. */
export function getFieldNameConflict(
  label: string,
  rows: BuilderFieldRow[],
  excludeClientId?: string,
): string | null {
  const trimmed = label.trim();
  if (!trimmed) return 'Field name is required.';

  const normalized = normalizeFieldName(trimmed);
  const storageKey = fieldKeyFromLabel(trimmed);

  if (!excludeClientId || !rows.find((r) => r.clientId === excludeClientId)?.isSystem) {
    if (SYSTEM_FIELD_KEYS.has(storageKey)) {
      return 'This name is reserved.';
    }
  }

  for (const row of rows) {
    if (row.clientId === excludeClientId) continue;

    if (normalizeFieldName(row.label) === normalized) {
      return 'A field with this name already exists.';
    }

    if (storageKey === rowStorageKey(row)) {
      return 'A field with this name already exists.';
    }
  }

  return null;
}

/** Drop blank rows; fill missing option values from labels (API requires both). */
export function normalizeFieldOptions(options: FieldOption[]): FieldOption[] {
  return options
    .map((opt) => {
      const label = opt.label.trim();
      const value = opt.value.trim() || slugifyFieldKey(label);
      return { value, label };
    })
    .filter((opt) => opt.label && opt.value);
}

export const DEFAULT_SELECT_OPTION: FieldOption = {
  value: 'Option 1',
  label: 'Option 1',
};

export function fieldTypeNeedsOptions(type: FieldType): boolean {
  return OPTION_FIELD_TYPES.has(type);
}

export function defaultFieldConfig(type: FieldType): FieldConfig | undefined {
  if (type === 'short_text') {
    return { max_length: SHORT_TEXT_MAX_LENGTH };
  }
  return undefined;
}

export function fieldTypeLabel(type: FieldType): string {
  const map: Record<FieldType, string> = {
    system_summary: 'Summary (system)',
    system_description: 'Description (system)',
    system_project: 'Project (system)',
    system_work_type: 'Work Type (system)',
    short_text: 'Single-line text',
    paragraph: 'Multi-line text',
    timestamp: 'Timestamp',
    dropdown: 'Single-select dropdown',
    date: 'Date picker',
    number: 'Number',
    labels: 'Labels',
    checkbox: 'Multi-select',
    people: 'People',
    url: 'URL',
    file: 'File attachment',
  };
  return map[type] ?? type;
}

export function optionsHintForType(type: FieldType): string | null {
  if (type === 'checkbox') return 'Users can select multiple options.';
  if (type === 'dropdown') return 'Users pick one option.';
  if (type === 'file') {
    return `Up to ${MAX_FILES_PER_SUBMISSION} files per submission, ${MAX_FILE_SIZE_MB} MB each.`;
  }
  return null;
}

const URL_PATTERN = /^https?:\/\/.+/i;

export function isValidUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048) return false;
  if (!URL_PATTERN.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export const CANVAS_CUSTOM_DROP_ID = 'canvas-custom-fields';

export function paletteDragId(clientId: string): string {
  return `palette-${clientId}`;
}

export function parsePaletteClientId(dragId: string | number): string | null {
  const id = String(dragId);
  return id.startsWith('palette-') ? id.slice('palette-'.length) : null;
}

export function fieldTypeDragId(fieldType: FieldType): string {
  return `field-type-${fieldType}`;
}

export function parseFieldTypeDragId(dragId: string | number): FieldType | null {
  const id = String(dragId);
  if (!id.startsWith('field-type-')) return null;
  const type = id.slice('field-type-'.length) as FieldType;
  return CUSTOM_FIELD_TYPE_OPTIONS.some((o) => o.value === type) ? type : null;
}

/** Default display name when adding a field from a type tile (dedupes with " 2", " 3", …). */
export function defaultLabelForType(type: FieldType, rows: BuilderFieldRow[]): string {
  const base = fieldTypeLabel(type);
  const names = new Set(rows.map((r) => normalizeFieldName(r.label)));
  if (!names.has(normalizeFieldName(base))) return base;
  let i = 2;
  while (names.has(normalizeFieldName(`${base} ${i}`))) i += 1;
  return `${base} ${i}`;
}

export function builderRowFromFieldType(
  fieldType: FieldType,
  label: string,
): BuilderFieldRow {
  const key = fieldKeyFromLabel(label);
  return {
    clientId: `new-${key}-${Date.now()}`,
    isSystem: false,
    field_key: key,
    label,
    field_type: fieldType,
    is_required: false,
    sort_order: 0,
    options: fieldTypeNeedsOptions(fieldType) ? [{ ...DEFAULT_SELECT_OPTION }] : [],
    field_config: defaultFieldConfig(fieldType),
    ...(fieldType === 'file'
      ? { max_files: MAX_FILES_PER_SUBMISSION, max_file_size_mb: MAX_FILE_SIZE_MB }
      : {}),
  };
}
