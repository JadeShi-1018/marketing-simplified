'use client';

import type { FieldType } from '@/types/ticketForm';
import { CUSTOM_FIELD_TYPE_OPTIONS } from './constants';
import FieldTypePaletteCard from './FieldTypePaletteCard';

interface Props {
  selectedFieldType: FieldType | null;
  onSelectFieldType: (fieldType: FieldType) => void;
}

export default function FieldTypePaletteList({
  selectedFieldType,
  onSelectFieldType,
}: Props) {
  return (
    <ul className="flex flex-col gap-1" data-testid="field-type-palette-list">
      {CUSTOM_FIELD_TYPE_OPTIONS.map((opt) => (
        <li key={opt.value}>
          <FieldTypePaletteCard
            fieldType={opt.value}
            label={opt.label}
            selected={selectedFieldType === opt.value}
            onSelect={() => onSelectFieldType(opt.value)}
          />
        </li>
      ))}
    </ul>
  );
}
