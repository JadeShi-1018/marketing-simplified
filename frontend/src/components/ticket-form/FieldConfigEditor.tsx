'use client';

import type { BuilderFieldRow, FieldConfig, FieldType } from '@/types/ticketForm';

interface Props {
  row: BuilderFieldRow;
  onChange: (patch: Partial<BuilderFieldRow>) => void;
  disabled?: boolean;
}

export default function FieldConfigEditor({ row, onChange, disabled }: Props) {
  const type = row.field_type as FieldType;
  const config = row.field_config ?? {};

  const patchConfig = (patch: Partial<FieldConfig>) => {
    onChange({ field_config: { ...config, ...patch } });
  };

  const inputClass =
    'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1';

  if (type === 'number') {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1 text-xs text-gray-500">
          Min
          <input
            type="number"
            disabled={disabled}
            value={config.min ?? ''}
            onChange={(e) =>
              patchConfig({ min: e.target.value === '' ? null : Number(e.target.value) })
            }
            className={`${inputClass} w-20`}
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-gray-500">
          Max
          <input
            type="number"
            disabled={disabled}
            value={config.max ?? ''}
            onChange={(e) =>
              patchConfig({ max: e.target.value === '' ? null : Number(e.target.value) })
            }
            className={`${inputClass} w-20`}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            disabled={disabled}
            checked={Boolean(config.integer_only)}
            onChange={(e) => patchConfig({ integer_only: e.target.checked })}
          />
          Whole numbers only
        </label>
      </div>
    );
  }

  if (type === 'people') {
    return (
      <label className="mt-2 flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          disabled={disabled}
          checked={Boolean(config.allow_multiple)}
          onChange={(e) => patchConfig({ allow_multiple: e.target.checked })}
        />
        Allow multiple people
      </label>
    );
  }

  if (type === 'file') {
    return (
      <p className="mt-2 text-xs text-gray-500">
        Up to 10 files per submission, 25 MB per file.
      </p>
    );
  }

  return null;
}
