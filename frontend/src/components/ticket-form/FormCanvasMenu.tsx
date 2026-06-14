'use client';

import { useRouter } from 'next/navigation';
import { Link2, Loader2, Save, Trash2 } from 'lucide-react';

interface Props {
  assignmentsHref: string;
  saving?: boolean;
  onSaveForm: () => void;
  onDeleteForm: () => void;
}

const iconButtonClass =
  'inline-flex h-9 w-9 items-center justify-center rounded-md bg-white text-gray-600 transition hover:bg-gray-50 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3CCED7]/60 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50';

export default function FormCanvasMenu({
  assignmentsHref,
  saving = false,
  onSaveForm,
  onDeleteForm,
}: Props) {
  const router = useRouter();

  return (
    <div className="flex items-center gap-1.5" data-testid="form-canvas-menu">
      <button
        type="button"
        className={iconButtonClass}
        disabled={saving}
        aria-label={saving ? 'Saving form' : 'Save form'}
        title={saving ? 'Saving...' : 'Save form'}
        onClick={onSaveForm}
      >
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Save className="h-4 w-4" aria-hidden />
        )}
      </button>

      <button
        type="button"
        className={iconButtonClass}
        aria-label="Go to assignments"
        title="Go to assignments"
        onClick={() => router.push(assignmentsHref)}
      >
        <Link2 className="h-4 w-4" aria-hidden />
      </button>

      <button
        type="button"
        className={`${iconButtonClass} hover:border-red-200 hover:bg-red-50 hover:text-red-600`}
        aria-label="Delete form"
        title="Delete form"
        onClick={onDeleteForm}
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
