import api from '../api';
import {
  PortalAuthResponse,
  PortalConversation,
  PortalConversationDetail,
  StartConversationPayload,
} from '@/types/portal';

const BASE = '/api/portal';

export default class PortalAPI {
  static async register(data: {
    email: string;
    password: string;
    full_name: string;
    company?: string;
    phone?: string;
  }): Promise<PortalAuthResponse> {
    const res = await api.post<PortalAuthResponse>(`${BASE}/register/`, data);
    return res.data;
  }

  static async listConversations(): Promise<PortalConversation[]> {
    const res = await api.get(`${BASE}/conversations/`);
    const data = res.data;
    return Array.isArray(data) ? data : (data?.results ?? []);
  }

  static async getConversation(id: number): Promise<PortalConversationDetail> {
    const res = await api.get<PortalConversationDetail>(`${BASE}/conversations/${id}/`);
    return res.data;
  }

  static async startConversation(payload: StartConversationPayload): Promise<PortalConversationDetail> {
    const res = await api.post<PortalConversationDetail>(`${BASE}/conversations/`, payload);
    return res.data;
  }

  static async sendMessage(conversationId: number, content: string) {
    const res = await api.post(`${BASE}/conversations/${conversationId}/messages/`, { content });
    return res.data;
  }
}
