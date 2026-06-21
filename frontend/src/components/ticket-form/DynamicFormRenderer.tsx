'use client';

import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ExperienceGroupAPI } from '@/lib/api/experienceGroupApi';
import type { RequestFormResponse, FormAnswers, TicketFormField } from '@/types/ticketForm';
import DynamicFormField, { type DynamicFormFieldVariant } from './DynamicFormField';
import FormMetadataCard from './FormMetadataCard';
import PortalFormMetadata from './portal/PortalFormMetadata';
import PortalSubmissionSuccess from './portal/PortalSubmissionSuccess';
import { isFileTooLarge } from './FileAttachmentField';
import { CLIENT_MESSAGES, parseFieldErrors } from './formErrors';
import {
  BUILDER_PRIMARY_BUTTON_CLASS,
  PORTAL_SUBMIT_BUTTON_CLASS,
  isValidUrl,
  MAX_FILES_PER_SUBMISSION,
  MAX_FILE_SIZE_MB,
} from './constants';

interface Props {
  experienceGroupId: number | string;
  schema: RequestFormResponse;
  projectId?: number;
  variant?: DynamicFormFieldVariant;
  onSubmitted?: (ticketId: number) => void;
  onSubmitAnother?: () => void;
}

function isEmptyAnswer(raw: unknown, field: TicketFormField): boolean {
  if (raw === undefined || raw === null) return true;
  if (field.field_type === 'number') {
    return raw === '' || (typeof raw === 'string' && raw.trim() === '');
  }
  if (Array.isArray(raw)) return raw.length === 0;
  if (typeof raw === 'string') return raw.trim() === '';
  return false;
}

export default function DynamicFormRenderer({
  experienceGroupId,
  schema,
  projectId,
  variant = 'default',
  onSubmitted,
  onSubmitAnother,
}: Props) {
  const isPortal = variant === 'portal';
  const sortedFields = useMemo(
    () => [...schema.fields].sort((a, b) => a.sort_order - b.sort_order),
    [schema.fields],
  );

  const [answers, setAnswers] = useState<FormAnswers>({});
  const [filesByField, setFilesByField] = useState<Record<string, File[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const totalFiles = useMemo(
    () => Object.values(filesByField).reduce((sum, files) => sum + files.length, 0),
    [filesByField],
  );

  const clearError = (key: string) => {
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const setText = (key: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
    clearError(key);
  };

  const setNumber = (key: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
    clearError(key);
  };

  const setMulti = (key: string, value: string[]) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
    clearError(key);
  };

  const setPeople = (key: string, ids: number[], allowMultiple: boolean) => {
    setAnswers((prev) => ({
      ...prev,
      [key]: allowMultiple ? ids : (ids[0] ?? ''),
    }));
    clearError(key);
  };

  const setFiles = (key: string, files: File[]) => {
    setFilesByField((prev) => ({ ...prev, [key]: files }));
    clearError(key);
    if (errors.attachments) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.attachments;
        return next;
      });
    }
  };

  const setFileSizeError = (key: string, message: string | null) => {
    if (message) {
      setErrors((prev) => ({ ...prev, [key]: message }));
    } else {
      clearError(key);
    }
  };

  const validateClient = (): boolean => {
    const next: Record<string, string> = {};

    if (totalFiles > MAX_FILES_PER_SUBMISSION) {
      next.attachments = CLIENT_MESSAGES.tooManyFiles;
    }

    sortedFields.forEach((field) => {
      if (field.field_type === 'file') {
        const uploads = filesByField[field.field_key] ?? [];
        const maxFileSizeMb = field.max_file_size_mb ?? MAX_FILE_SIZE_MB;
        if (field.is_required && uploads.length === 0) {
          next[field.field_key] = CLIENT_MESSAGES.required;
        }
        if (uploads.some((file) => isFileTooLarge(file, maxFileSizeMb))) {
          next[field.field_key] = `Each file must be ${maxFileSizeMb} MB or smaller.`;
        }
        return;
      }

      const raw = answers[field.field_key];
      if (field.is_required && isEmptyAnswer(raw, field)) {
        next[field.field_key] = CLIENT_MESSAGES.required;
        return;
      }

      if (isEmptyAnswer(raw, field)) return;

      const config = field.field_config ?? {};

      if (field.field_type === 'short_text' && typeof raw === 'string') {
        const maxLen = config.max_length ?? 255;
        if (raw.length > maxLen) {
          next[field.field_key] = `Please enter at most ${maxLen} characters.`;
        }
      }

      if (field.field_type === 'number') {
        const num = typeof raw === 'number' ? raw : Number(raw);
        if (Number.isNaN(num)) {
          next[field.field_key] = 'Please enter a valid number.';
        } else {
          if (config.integer_only && !Number.isInteger(num)) {
            next[field.field_key] = 'Please enter a whole number.';
          }
          if (config.min != null && num < config.min) {
            next[field.field_key] = 'Please enter a valid number.';
          }
          if (config.max != null && num > config.max) {
            next[field.field_key] = 'Please enter a valid number.';
          }
        }
      }

      if (field.field_type === 'url' && typeof raw === 'string' && !isValidUrl(raw)) {
        next[field.field_key] = 'Please enter a valid URL.';
      }
    });

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || submitted) return;
    if (!validateClient()) return;

    const payload: FormAnswers = { ...answers };
    sortedFields.forEach((field) => {
      if (field.field_type === 'number' && payload[field.field_key] !== undefined) {
        const raw = payload[field.field_key];
        const num = typeof raw === 'number' ? raw : Number(raw);
        if (!Number.isNaN(num)) {
          payload[field.field_key] = field.field_config?.integer_only ? Math.trunc(num) : num;
        }
      }
    });

    setSubmitting(true);
    setErrors({});
    try {
      const res = await ExperienceGroupAPI.submitRequest(experienceGroupId, payload, filesByField);
      setSubmitted(true);
      if (!isPortal) {
        toast.success(`Request submitted (ticket #${res.data.ticket_id}).`);
      }
      onSubmitted?.(res.data.ticket_id);
    } catch (err: unknown) {
      const data = (err as { response?: { data?: unknown } })?.response?.data;
      const mapped = parseFieldErrors(data);
      if (Object.keys(mapped).length === 0) {
        toast.error('Could not submit request. Please try again.');
      } else {
        setErrors(mapped);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitAnother = () => {
    setSubmitted(false);
    setAnswers({});
    setFilesByField({});
    setErrors({});
    onSubmitAnother?.();
  };

  if (submitted) {
    if (isPortal) {
      return <PortalSubmissionSuccess onSubmitAnother={handleSubmitAnother} />;
    }

    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
        Your request was submitted successfully. This is preview mode — the ticket was created for
        testing.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {isPortal ? (
        <PortalFormMetadata title={schema.form_name} description={schema.form_description} />
      ) : (
        <FormMetadataCard title={schema.form_name} description={schema.form_description} />
      )}

      <form onSubmit={handleSubmit} className={`flex flex-col ${isPortal ? 'space-y-6' : 'gap-6'}`}>
      {errors.attachments && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errors.attachments}
        </p>
      )}

      {sortedFields.map((field) => {
        const raw = answers[field.field_key];
        const fieldFiles = filesByField[field.field_key] ?? [];
        const otherFileCount = totalFiles - fieldFiles.length;
        const maxTotalFiles = Math.max(0, MAX_FILES_PER_SUBMISSION - otherFileCount);
        const fieldError =
          errors[field.field_key] ?? errors[`attachments.${field.field_key}`];
        const textVal = typeof raw === 'string' ? raw : '';
        const numberVal =
          typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw : '';
        const multiVal = Array.isArray(raw)
          ? raw.map(String)
          : typeof raw === 'string' && field.field_type === 'labels'
            ? [raw]
            : [];
        const peopleIds = (() => {
          if (field.field_type !== 'people') return [];
          if (Array.isArray(raw)) return raw.map(Number).filter((n) => !Number.isNaN(n));
          if (typeof raw === 'number') return [raw];
          if (typeof raw === 'string' && raw) {
            const n = Number(raw);
            return Number.isNaN(n) ? [] : [n];
          }
          return [];
        })();

        return (
          <DynamicFormField
            key={field.field_key}
            field={field}
            value={textVal}
            numberValue={numberVal}
            values={multiVal}
            peopleIds={peopleIds}
            files={fieldFiles}
            maxTotalFiles={maxTotalFiles}
            options={{
              support_projects: schema.options.support_projects ?? [],
              work_types: schema.options.work_types ?? [],
              project_members: schema.options.project_members ?? [],
            }}
            projectId={projectId}
            error={fieldError}
            disabled={submitting}
            variant={variant}
            onTextChange={(v) => setText(field.field_key, v)}
            onNumberChange={(v) => setNumber(field.field_key, v)}
            onMultiChange={(v) => setMulti(field.field_key, v)}
            onPeopleChange={(ids) =>
              setPeople(field.field_key, ids, Boolean(field.field_config?.allow_multiple))
            }
            onFilesChange={(files) => setFiles(field.field_key, files)}
            onFileSizeError={(message) => setFileSizeError(field.field_key, message)}
          />
        );
      })}

      <div className={isPortal ? 'mt-8 flex justify-end' : undefined}>
        <button
          type="submit"
          disabled={submitting}
          className={
            isPortal
              ? PORTAL_SUBMIT_BUTTON_CLASS
              : `rounded-lg px-4 py-2.5 text-sm font-medium ${BUILDER_PRIMARY_BUTTON_CLASS}`
          }
        >
          {submitting ? 'Submitting...' : isPortal ? 'Submit' : 'Submit request'}
        </button>
      </div>
      </form>
    </div>
  );
}
