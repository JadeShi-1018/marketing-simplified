'use client';

import type { TicketFormField } from '@/types/ticketForm';
import FormFieldError from '../FormFieldError';

interface Props {
  field: TicketFormField;
  error?: string;
  children: React.ReactNode;
}

/** Flat portal field — label above control, no bordered card wrapper. */
export default function PortalFieldGroup({ field, error, children }: Props) {
  return (
    <div>
      <div className="flex items-center gap-0.5">
        <span className="text-sm font-semibold leading-snug text-gray-900">{field.label}</span>
        {field.is_required ? (
          <span className="shrink-0 text-sm font-semibold text-red-600">*</span>
        ) : null}
      </div>
      {field.help_text ? (
        <p className="mt-1 text-xs leading-normal text-gray-500">{field.help_text}</p>
      ) : null}
      <div className={field.help_text ? 'mt-0.5' : 'mt-2'}>{children}</div>
      <FormFieldError message={error} />
    </div>
  );
}
