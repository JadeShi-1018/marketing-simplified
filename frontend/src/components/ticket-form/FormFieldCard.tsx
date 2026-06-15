'use client';

import type { TicketFormField } from '@/types/ticketForm';
import FormFieldError from './FormFieldError';

interface Props {
  field: TicketFormField;
  error?: string;
  children: React.ReactNode;
}

/** Customer/preview field card — matches ticket form builder canvas cards. */
export default function FormFieldCard({ field, error, children }: Props) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="flex items-center gap-0.5">
        <span className="text-sm font-semibold text-gray-900">{field.label}</span>
        {field.is_required && (
          <span className="shrink-0 text-sm font-semibold text-red-500">*</span>
        )}
      </div>
      {field.help_text && <p className="mt-1 text-sm text-gray-500">{field.help_text}</p>}
      <div className="mt-3">{children}</div>
      <FormFieldError message={error} />
    </div>
  );
}
