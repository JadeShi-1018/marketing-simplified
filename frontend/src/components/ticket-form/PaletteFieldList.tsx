'use client';

import type { BuilderFieldRow } from '@/types/ticketForm';
import PaletteFieldCard from './PaletteFieldCard';

interface Props {
  paletteFields: BuilderFieldRow[];
  selectedClientId: string | null;
  onSelect: (clientId: string) => void;
}

export default function PaletteFieldList({
  paletteFields,
  selectedClientId,
  onSelect,
}: Props) {
  if (paletteFields.length === 0) {
    return null;
  }

  return (
    <ul className="flex flex-col gap-2">
      {paletteFields.map((row) => (
        <li key={row.clientId}>
          <PaletteFieldCard
            row={row}
            selected={selectedClientId === row.clientId}
            onSelect={() => onSelect(row.clientId)}
          />
        </li>
      ))}
    </ul>
  );
}
