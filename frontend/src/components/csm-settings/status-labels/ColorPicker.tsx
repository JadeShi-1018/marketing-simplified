'use client';

import { Check } from 'lucide-react';

/**
 * Predefined palette for customer status labels (MED-217).
 *
 * Six curated, slightly-muted jewel tones (plus neutral slate) chosen to read
 * as premium "soft pill" badges: each is dark enough to be legible as text on a
 * faint tint of itself, and the hues stay distinct as small badges.
 */
export const STATUS_LABEL_PALETTE: { name: string; value: string }[] = [
  // Borrowed from the product's own tokens: success green (#16A34A),
  // destructive red (#DC2626), warning amber (#D97706) and the brand teal,
  // plus the two metallic tones.
  { name: 'Gold', value: '#A16207' },
  { name: 'Silver', value: '#64748B' },
  { name: 'Green', value: '#16A34A' },
  { name: 'Red', value: '#DC2626' },
  { name: 'Teal', value: '#0E7490' },
  { name: 'Amber', value: '#D97706' },
];

export const DEFAULT_STATUS_LABEL_COLOR = STATUS_LABEL_PALETTE[0].value;

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
}

export default function ColorPicker({ value, onChange, disabled }: ColorPickerProps) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Label color">
      {STATUS_LABEL_PALETTE.map((color) => {
        const selected = value.toLowerCase() === color.value.toLowerCase();
        return (
          <button
            key={color.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(color.value)}
            role="radio"
            aria-checked={selected}
            aria-label={color.name}
            title={color.name}
            className={`flex h-8 w-8 items-center justify-center rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#86E9A8]/60 focus-visible:ring-offset-1 disabled:opacity-50 ${
              selected ? 'ring-2 ring-[#86E9A8] ring-offset-2' : 'hover:scale-105'
            }`}
            style={{ backgroundColor: color.value }}
          >
            {selected && <Check className="h-4 w-4 text-white" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}
