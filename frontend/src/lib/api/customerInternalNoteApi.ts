import api from '../api';
import type {
  CustomerInternalNote,
  CustomerInternalNoteAuditLog,
} from '@/types/customer';
import type { TiptapJSONContent } from '@/types/comment';

const BASE = '/api/customer-internal-notes';
const AUDIT_BASE = '/api/customer-internal-note-audit-logs';

function unwrap<T>(data: unknown): T[] {
  return Array.isArray(data) ? data : ((data as { results?: T[] })?.results ?? []);
}

export const CustomerInternalNoteAPI = {
  list: (customerId: number) =>
    api
      .get<CustomerInternalNote[] | { results: CustomerInternalNote[] }>(`${BASE}/`, {
        params: { customer: customerId },
      })
      .then((res) => unwrap<CustomerInternalNote>(res.data)),

  create: (data: { customer: number; body: TiptapJSONContent }) =>
    api.post<CustomerInternalNote>(`${BASE}/`, data),

  update: (id: number, data: { body: TiptapJSONContent }) =>
    api.patch<CustomerInternalNote>(`${BASE}/${id}/`, data),

  destroy: (id: number) =>
    api.delete(`${BASE}/${id}/`),

  auditLogs: (customerId: number) =>
    api
      .get<CustomerInternalNoteAuditLog[] | { results: CustomerInternalNoteAuditLog[] }>(
        `${AUDIT_BASE}/`,
        { params: { customer: customerId } },
      )
      .then((res) => unwrap<CustomerInternalNoteAuditLog>(res.data)),
};

// ── Tiptap helpers ────────────────────────────────────────────────────────────
// The backend stores note bodies as Tiptap JSON. The profile panel uses a simple
// textarea, so convert to/from a minimal Tiptap document (one paragraph per line).

export function textToTiptap(text: string): TiptapJSONContent {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  return {
    type: 'doc',
    content: lines.map((line) =>
      line.length
        ? { type: 'paragraph', content: [{ type: 'text', text: line }] }
        : { type: 'paragraph' },
    ),
  };
}
