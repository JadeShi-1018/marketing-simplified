import axios from 'axios';
import { getApiErrorDetail } from '@/lib/api/errorMessage';
import type { QuickStartApiErrorBody } from '@/types/quickStart';

/** Fallback when the API does not return a structured error body. */
export const QUICK_START_PREVIEW_ERROR_FALLBACK =
  'We could not generate a preview right now. Please try again in a moment.';

export const QUICK_START_CONFIRM_ERROR_FALLBACK =
  'We could not create the project right now. Please try again.';

const MESSAGE_BY_ERROR_CODE: Record<string, string> = {
  rate_limited:
    'AI requests are coming in too quickly. Please wait 30 seconds, then try again.',
  malformed_output:
    'We could not finish building your draft. Please try Generate preview again.',
  network_error:
    'We could not reach the AI service. Check your connection and try again.',
  llm_generation_failed: QUICK_START_PREVIEW_ERROR_FALLBACK,
  configuration_error:
    'AI setup is not complete. Ask your administrator to configure the Gemini API key.',
  validation_failed: 'Please check your campaign description and try again.',
};

/** Patterns that indicate a technical message we should not show to users. */
const TECHNICAL_DETAIL_PATTERN =
  /json|traceback|http\s*\d{3}|gemini|unterminated|runtimeerror|exception|429|too many requests/i;

export type QuickStartResolvedError = {
  message: string;
  errorCode?: string;
  retryAfterSeconds?: number;
};

function isTechnicalDetail(detail: string): boolean {
  return TECHNICAL_DETAIL_PATTERN.test(detail);
}

export function resolveQuickStartError(
  error: unknown,
  fallback: string
): QuickStartResolvedError {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (data && typeof data === 'object') {
      const body = data as QuickStartApiErrorBody & {
        retry_after_seconds?: number;
      };
      const code = typeof body.error === 'string' ? body.error : undefined;
      const retryAfterSeconds =
        typeof body.retry_after_seconds === 'number' && body.retry_after_seconds > 0
          ? body.retry_after_seconds
          : code === 'rate_limited'
            ? 30
            : undefined;

      if (code && MESSAGE_BY_ERROR_CODE[code]) {
        return {
          message: MESSAGE_BY_ERROR_CODE[code],
          errorCode: code,
          retryAfterSeconds,
        };
      }

      if (typeof body.detail === 'string' && body.detail.trim()) {
        const detail = body.detail.trim();
        if (!isTechnicalDetail(detail)) {
          return {
            message: detail,
            errorCode: code,
            retryAfterSeconds,
          };
        }
        if (code === 'rate_limited' || /429|too many/i.test(detail)) {
          return {
            message: MESSAGE_BY_ERROR_CODE.rate_limited,
            errorCode: 'rate_limited',
            retryAfterSeconds: retryAfterSeconds ?? 30,
          };
        }
        if (code === 'llm_generation_failed' || /malformed|not valid json/i.test(detail)) {
          return {
            message: MESSAGE_BY_ERROR_CODE.malformed_output,
            errorCode: 'malformed_output',
          };
        }
      }
    }
  }

  const generic = getApiErrorDetail(error, fallback);
  if (!isTechnicalDetail(generic)) {
    return { message: generic };
  }
  return { message: fallback };
}
