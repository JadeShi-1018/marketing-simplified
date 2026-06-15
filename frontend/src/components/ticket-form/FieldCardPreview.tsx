'use client';

import type { FieldType } from '@/types/ticketForm';

interface Props {
  fieldType: FieldType;
}

function previewText(fieldType: FieldType): string {
  switch (fieldType) {
    case 'system_project':
    case 'system_work_type':
    case 'dropdown':
      return 'Select an option';
    case 'date':
      return 'Select a date';
    case 'timestamp':
      return 'Select date and time';
    case 'number':
      return 'Enter a number';
    case 'labels':
      return 'Select labels';
    case 'checkbox':
      return 'Select options';
    case 'people':
      return 'Select people';
    case 'url':
      return 'https://';
    case 'file':
      return 'Drag files here or click to browse';
    case 'system_description':
    case 'paragraph':
      return 'Answer will be written here';
    default:
      return 'Answer will be written here';
  }
}

function isMultiline(fieldType: FieldType): boolean {
  return fieldType === 'system_description' || fieldType === 'paragraph';
}

export default function FieldCardPreview({ fieldType }: Props) {
  const text = previewText(fieldType);
  const multiline = isMultiline(fieldType);

  return (
    <div
      className={`mt-1 w-full rounded  bg-gray-100 px-3 py-2.5 text-sm text-gray-400 ${
        multiline ? 'min-h-[72px]' : 'min-h-[40px]'
      }`}
      aria-hidden
    >
      {text}
    </div>
  );
}
