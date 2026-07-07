import api from '../api';
import {
  Conversation,
  ConversationDetail,
  ConversationMessage,
  SendMessagePayload,
  CreateTicketPayload,
  UpdateConversationPayload,
  QuickReplyTemplate,
  QuickReplyTemplatePayload,
  QuickReplyTemplateHistory,
  Ticket,
} from '@/types/csmConversation';

const BASE = '/api/csm/conversations';

function unwrap<T>(data: unknown): T[] {
  return Array.isArray(data) ? data : ((data as { results?: T[] })?.results ?? []);
}

export default class CsmConversationAPI {
  static async list(params?: { queue?: number | null }): Promise<Conversation[]> {
    const query = params?.queue ? { queue: params.queue } : undefined;
    const res = await api.get(`${BASE}/`, { params: query });
    return unwrap<Conversation>(res.data);
  }

  static async get(conversationId: number): Promise<ConversationDetail> {
    const res = await api.get<ConversationDetail>(`${BASE}/${conversationId}/`);
    return res.data;
  }

  static async create(data: Partial<Conversation>): Promise<Conversation> {
    const res = await api.post<Conversation>(`${BASE}/`, data);
    return res.data;
  }

  static async update(conversationId: number, data: UpdateConversationPayload): Promise<Conversation> {
    const res = await api.patch<Conversation>(`${BASE}/${conversationId}/`, data);
    return res.data;
  }

  static async claim(conversationId: number): Promise<Ticket> {
    const res = await api.post<Ticket>(`${BASE}/${conversationId}/claim/`);
    return res.data;
  }

  static async sendMessage(
    conversationId: number,
    payload: SendMessagePayload & { image?: File | null }
  ): Promise<ConversationMessage> {
    if (payload.image) {
      const form = new FormData();
      if (payload.content) form.append('content', payload.content);
      form.append('image', payload.image);
      const res = await api.post<ConversationMessage>(`${BASE}/${conversationId}/messages/`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data;
    }
    const res = await api.post<ConversationMessage>(`${BASE}/${conversationId}/messages/`, payload);
    return res.data;
  }

  static async createTicket(
    conversationId: number,
    payload: CreateTicketPayload
  ): Promise<{ ticket: object; system_message: ConversationMessage }> {
    const res = await api.post(`${BASE}/${conversationId}/create_ticket/`, payload);
    return res.data;
  }
}

const TMPL_BASE = '/api/csm/templates';

export class TicketAPI {
  static async list(params?: {
    queue?: number;
    status?: string;
    assigned_to?: string;
    ordering?: 'priority' | '-priority' | string;
  }): Promise<Ticket[]> {
    const res = await api.get('/api/csm/tickets/', { params });
    return Array.isArray(res.data) ? res.data : (res.data?.results ?? []);
  }

  static async listByQueue(queueId: number, status?: string, ordering?: string): Promise<Ticket[]> {
    return TicketAPI.list({ queue: queueId, ...(status ? { status } : {}), ...(ordering ? { ordering } : {}) });
  }

  static async myTickets(ordering?: string): Promise<Ticket[]> {
    return TicketAPI.list({ assigned_to: 'me', ...(ordering ? { ordering } : {}) });
  }

  static async claim(id: number): Promise<Ticket> {
    const res = await api.post<Ticket>(`/api/csm/tickets/${id}/claim/`);
    return res.data;
  }

  static async close(id: number): Promise<Ticket> {
    const res = await api.post<Ticket>(`/api/csm/tickets/${id}/close/`);
    return res.data;
  }

  static async update(id: number, data: Partial<Ticket>): Promise<Ticket> {
    const res = await api.patch<Ticket>(`/api/csm/tickets/${id}/`, data);
    return res.data;
  }
}

export class QuickReplyTemplateAPI {
  static async list(params?: { organisation?: number; tag?: string; search?: string }): Promise<QuickReplyTemplate[]> {
    const res = await api.get(`${TMPL_BASE}/`, { params });
    return Array.isArray(res.data) ? res.data : (res.data?.results ?? []);
  }

  static async get(id: number): Promise<QuickReplyTemplate> {
    const res = await api.get<QuickReplyTemplate>(`${TMPL_BASE}/${id}/`);
    return res.data;
  }

  static async create(payload: QuickReplyTemplatePayload): Promise<QuickReplyTemplate> {
    const res = await api.post<QuickReplyTemplate>(`${TMPL_BASE}/`, payload);
    return res.data;
  }

  static async update(id: number, payload: Partial<QuickReplyTemplatePayload>): Promise<QuickReplyTemplate> {
    const res = await api.patch<QuickReplyTemplate>(`${TMPL_BASE}/${id}/`, payload);
    return res.data;
  }

  static async remove(id: number): Promise<void> {
    await api.delete(`${TMPL_BASE}/${id}/`);
  }

  static async history(id: number): Promise<QuickReplyTemplateHistory[]> {
    const res = await api.get<QuickReplyTemplateHistory[]>(`${TMPL_BASE}/${id}/history/`);
    return Array.isArray(res.data) ? res.data : [];
  }
}
