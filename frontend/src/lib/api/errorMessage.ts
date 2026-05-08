import axios from 'axios';

/**
 * Human-readable message from Django/DRF (or proxied) error responses.
 * Avoid relying on `statusText` — HTTP/2 often leaves it empty (Chrome shows "422 (Unknown Status)" in Network).
 */
export function getApiErrorDetail(error: unknown, fallback: string): string {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error && error.message ? error.message : fallback;
  }
  const data = error.response?.data;
  const status = error.response?.status;

  if (data == null || data === '') {
    if (status === 422) {
      return 'Linear rejected this request (HTTP 422). Open Network → the failed request → Response for the JSON detail, or reconnect Linear under Integrations.';
    }
    if (status != null) {
      return `${fallback} (HTTP ${status})`;
    }
    return fallback;
  }

  if (typeof data === 'string') {
    const t = data.trim();
    if (!t || t.startsWith('<')) return fallback;
    return t.length > 500 ? `${t.slice(0, 500)}…` : t;
  }

  if (typeof data === 'object' && data !== null) {
    const d = data as Record<string, unknown>;
    if (typeof d.detail === 'string' && d.detail.trim()) return d.detail;
    if (Array.isArray(d.detail) && d.detail.length) {
      return d.detail.map((x) => String(x)).join(' ');
    }
    if (typeof d.message === 'string' && d.message.trim()) return d.message;
    if (Array.isArray(d.non_field_errors) && d.non_field_errors.length) {
      return String(d.non_field_errors[0]);
    }
  }

  return fallback;
}
