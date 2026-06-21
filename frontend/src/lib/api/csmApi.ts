import api from '../api';
import {
  Queue, CreateQueueData, UpdateQueueData,
  QueueAgent, QueueTeam, QueueTicketCounts,
  CustomerUser, CreateCustomerUserData, UpdateCustomerUserData,
  CsmNotification, InviteUserData,
} from '@/types/csm';

const BASE = '/api/csm';

function unwrap<T>(data: any): T[] {
  return Array.isArray(data) ? data : (data?.results ?? []);
}

export default class CsmAPI {
  // ── Queues ──────────────────────────────────────────────────────────────

  static async getQueues(params?: { organisation?: number }) {
    const res = await api.get(`${BASE}/queues/`, { params });
    return unwrap<Queue>(res.data);
  }

  static async listProjectQueues(projectId: number) {
    const res = await api.get(`${BASE}/projects/${projectId}/queues/`);
    return unwrap<Queue>(res.data);
  }

  static async getQueue(queueId: number | string) {
    const res = await api.get<Queue>(`${BASE}/queues/${queueId}/`);
    return res.data;
  }

  static async createQueue(data: CreateQueueData) {
    const res = await api.post<Queue>(`${BASE}/queues/`, data);
    return res.data;
  }

  static async updateQueue(queueId: number | string, data: UpdateQueueData) {
    const res = await api.patch<Queue>(`${BASE}/queues/${queueId}/`, data);
    return res.data;
  }

  static async deleteQueue(queueId: number | string) {
    await api.delete(`${BASE}/queues/${queueId}/`);
  }

  static async getTicketCounts(queueId: number) {
    const res = await api.get<QueueTicketCounts>(`${BASE}/queues/${queueId}/ticket_counts/`);
    return res.data;
  }

  // ── Queue Agents ────────────────────────────────────────────────────────

  static async getQueueAgents(queueId: number) {
    const res = await api.get(`${BASE}/queues/${queueId}/agents/`);
    return unwrap<QueueAgent>(res.data);
  }

  static async assignAgent(queueId: number, userId: number) {
    const res = await api.post<QueueAgent>(`${BASE}/queues/${queueId}/agents/`, { user: userId });
    return res.data;
  }

  static async removeAgent(queueId: number, assignmentId: number) {
    await api.delete(`${BASE}/queues/${queueId}/agents/${assignmentId}/`);
  }

  // ── Queue Teams ─────────────────────────────────────────────────────────

  static async getQueueTeams(queueId: number) {
    const res = await api.get(`${BASE}/queues/${queueId}/teams/`);
    return unwrap<QueueTeam>(res.data);
  }

  static async assignTeam(queueId: number, teamId: number) {
    const res = await api.post<QueueTeam>(`${BASE}/queues/${queueId}/teams/`, { team: teamId });
    return res.data;
  }

  static async removeTeam(queueId: number, assignmentId: number) {
    await api.delete(`${BASE}/queues/${queueId}/teams/${assignmentId}/`);
  }

  // ── Customer Users ────────────────────────────────────────────────────

  static async getCustomerUsers(params?: { organisation?: number }) {
    const res = await api.get(`${BASE}/customer-users/`, { params });
    return unwrap<CustomerUser>(res.data);
  }

  static async createCustomerUser(data: CreateCustomerUserData) {
    const res = await api.post<CustomerUser>(`${BASE}/customer-users/`, data);
    return res.data;
  }

  static async updateCustomerUser(id: number, data: UpdateCustomerUserData) {
    const res = await api.patch<CustomerUser>(`${BASE}/customer-users/${id}/`, data);
    return res.data;
  }

  static async deleteCustomerUser(id: number) {
    await api.delete(`${BASE}/customer-users/${id}/`);
  }

  // ── Notifications ──────────────────────────────────────────────────────

  static async getNotifications() {
    const res = await api.get(`${BASE}/notifications/`);
    return unwrap<CsmNotification>(res.data);
  }

  static async getUnreadCount(): Promise<number> {
    const res = await api.get<{ count: number }>(`${BASE}/notifications/unread_count/`);
    return res.data.count;
  }

  static async markRead(notificationId: number) {
    const res = await api.post<CsmNotification>(`${BASE}/notifications/${notificationId}/mark_read/`);
    return res.data;
  }

  static async acceptNotification(notificationId: number) {
    const res = await api.post<CsmNotification>(`${BASE}/notifications/${notificationId}/accept/`);
    return res.data;
  }

  static async declineNotification(notificationId: number) {
    const res = await api.post<CsmNotification>(`${BASE}/notifications/${notificationId}/decline/`);
    return res.data;
  }

  static async inviteUser(data: InviteUserData) {
    const res = await api.post(`${BASE}/customer-users/invite/`, data);
    return res.data;
  }
}
