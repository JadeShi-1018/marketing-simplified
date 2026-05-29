import {
  QUICK_START_PREVIEW_ERROR_FALLBACK,
  resolveQuickStartError,
} from '@/lib/quickStartUserMessages';
import { AxiosError, AxiosHeaders } from 'axios';

describe('resolveQuickStartError', () => {
  it('maps rate_limited API error to friendly message', () => {
    const error = new AxiosError('Request failed');
    error.response = {
      status: 502,
      statusText: 'Bad Gateway',
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: {
        error: 'rate_limited',
        detail: 'Gemini rate limited (HTTP 429).',
        retry_after_seconds: 30,
      },
    };

    const resolved = resolveQuickStartError(error, QUICK_START_PREVIEW_ERROR_FALLBACK);
    expect(resolved.message).toContain('30 seconds');
    expect(resolved.errorCode).toBe('rate_limited');
    expect(resolved.retryAfterSeconds).toBe(30);
  });

  it('hides technical JSON parse errors', () => {
    const error = new AxiosError('Request failed');
    error.response = {
      status: 502,
      statusText: 'Bad Gateway',
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: {
        error: 'malformed_output',
        detail: 'Gemini response is not valid JSON: Unterminated string',
      },
    };

    const resolved = resolveQuickStartError(error, QUICK_START_PREVIEW_ERROR_FALLBACK);
    expect(resolved.message).not.toMatch(/json|unterminated|gemini/i);
    expect(resolved.message).toContain('Generate preview');
  });
});
