/** Map DRF 400 body to field_key → first message string */
export function parseFieldErrors(data: unknown): Record<string, string> {
  if (!data || typeof data !== 'object') return {};
  const out: Record<string, string> = {};
  Object.entries(data as Record<string, unknown>).forEach(([key, val]) => {
    if (key === 'detail') return;
    if (Array.isArray(val) && val.length > 0) out[key] = String(val[0]);
    else if (typeof val === 'string') out[key] = val;
  });
  return out;
}

import { MAX_FILES_PER_SUBMISSION, MAX_FILE_SIZE_MB } from './constants';

export const CLIENT_MESSAGES = {
  required: 'This field is required.',
  tooManyFiles: `You can attach up to ${MAX_FILES_PER_SUBMISSION} files.`,
  fileTooLarge: `Each file must be ${MAX_FILE_SIZE_MB} MB or smaller.`,
};
