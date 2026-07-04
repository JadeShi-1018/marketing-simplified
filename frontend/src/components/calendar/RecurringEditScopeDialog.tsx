import React from "react";
import type { RecurringEditScope } from "@/lib/api/calendarApi";

type RecurringEditScopeDialogProps = {
  open: boolean;
  title?: string;
  defaultScope?: RecurringEditScope;
  /** When true, only "All events" is shown (e.g. repeat-rule changes). */
  lockToAll?: boolean;
  notice?: string;
  onCancel: () => void;
  onConfirm: (scope: RecurringEditScope) => void;
};

export const RECURRING_SCOPE_OPTIONS: {
  value: RecurringEditScope;
  label: string;
}[] = [
  { value: "this", label: "This event" },
  { value: "future", label: "This and following events" },
  { value: "all", label: "All events" },
];

type RecurringEditScopeFieldProps = {
  value: RecurringEditScope;
  onChange: (scope: RecurringEditScope) => void;
  lockToAll?: boolean;
  notice?: string;
};

/** Inline radio group for choosing recurring edit scope inside a form. */
export function RecurringEditScopeField({
  value,
  onChange,
  lockToAll = false,
  notice,
}: RecurringEditScopeFieldProps) {
  const visibleOptions = lockToAll
    ? RECURRING_SCOPE_OPTIONS.filter((option) => option.value === "all")
    : RECURRING_SCOPE_OPTIONS;

  return (
    <div
      className="rounded-lg border border-gray-200 bg-gray-50 p-3"
      data-testid="recurring-scope-field"
    >
      <p className="text-xs font-medium text-gray-600">Apply changes to</p>
      {notice && (
        <p
          className="mt-1 text-xs text-gray-500"
          data-testid="recurring-scope-notice"
        >
          {notice}
        </p>
      )}
      <div className="mt-2 space-y-1">
        {visibleOptions.map((option) => (
          <label
            key={option.value}
            data-testid={`recurring-scope-option-${option.value}`}
            className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-white"
          >
            <input
              type="radio"
              name="recurring-edit-scope"
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="h-4 w-4 text-[#3CCED7] focus:ring-[#3CCED7]"
            />
            <span className="text-sm text-gray-800">{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

/**
 * Prompt asking which occurrences a recurring-event edit should apply to.
 * Pure UI: it only reports the chosen scope; callers own the HTTP request.
 */
export function RecurringEditScopeDialog({
  open,
  title = "Edit recurring event",
  defaultScope = "this",
  lockToAll = false,
  notice,
  onCancel,
  onConfirm,
}: RecurringEditScopeDialogProps) {
  const [scope, setScope] = React.useState<RecurringEditScope>(
    lockToAll ? "all" : defaultScope,
  );

  React.useEffect(() => {
    if (open) {
      setScope(lockToAll ? "all" : defaultScope);
    }
  }, [open, defaultScope, lockToAll]);

  if (!open) {
    return null;
  }

  const visibleOptions = lockToAll
    ? RECURRING_SCOPE_OPTIONS.filter((option) => option.value === "all")
    : RECURRING_SCOPE_OPTIONS;

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-black/30"
        aria-hidden
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-label={title}
        data-testid="recurring-scope-dialog"
        className="fixed left-1/2 top-1/2 z-[70] w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>

        {notice && (
          <p
            className="mt-2 text-sm text-gray-600"
            data-testid="recurring-scope-notice"
          >
            {notice}
          </p>
        )}

        <div className="mt-4 space-y-1">
          {visibleOptions.map((option) => (
            <label
              key={option.value}
              data-testid={`recurring-scope-option-${option.value}`}
              className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-gray-50"
            >
              <input
                type="radio"
                name="recurring-scope"
                value={option.value}
                checked={scope === option.value}
                onChange={() => setScope(option.value)}
                className="h-4 w-4 text-[#3CCED7] focus:ring-[#3CCED7]"
              />
              <span className="text-sm text-gray-800">{option.label}</span>
            </label>
          ))}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            data-testid="recurring-scope-cancel"
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="recurring-scope-confirm"
            className="rounded-md bg-gradient-to-r from-[#3CCED7] to-[#A6E661] px-5 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-95"
            onClick={() => onConfirm(scope)}
          >
            OK
          </button>
        </div>
      </div>
    </>
  );
}
