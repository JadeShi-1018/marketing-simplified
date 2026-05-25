import api from '../api';
import {
  Queue, CreateQueueData, UpdateQueueData,
  QueueAgent, QueueTeam, QueueTicketCounts,
  CSMInvitation, CreateInvitationData,
} from '@/types/csm';

const BASE = '/api/csm';

export default class CsmAPI {
  // ── Queues ──────────────────────────────────────────────────────────────

  static async getQueues(projectId: number) {
    const res = await api.get(`${BASE}/projects/${projectId}/queues/`);
    const data = res.data;
    // Handle both paginated {results:[]} and plain array responses
    return Array.isArray(data) ? data as Queue[] : (data?.results ?? []) as Queue[];
  }

  static async getQueue(queueId: number) {
    const res = await api.get<Queue>(`${BASE}/queues/${queueId}/`);
    return res.data;
  }

  static async createQueue(data: CreateQueueData) {
    const res = await api.post<Queue>(`${BASE}/projects/${data.project}/queues/`, data);
    return res.data;
  }

  static async updateQueue(queueId: number, data: UpdateQueueData) {
    const res = await api.patch<Queue>(`${BASE}/queues/${queueId}/`, data);
    return res.data;
  }

  static async deleteQueue(queueId: number) {
    await api.delete(`${BASE}/queues/${queueId}/`);
  }

  static async getTicketCounts(queueId: number) {
    const res = await api.get<QueueTicketCounts>(`${BASE}/queues/${queueId}/ticket_counts/`);
    return res.data;
  }

  // ── Queue Agents ────────────────────────────────────────────────────────

  static async getQueueAgents(queueId: number) {
    const res = await api.get(`${BASE}/queues/${queueId}/agents/`);
    const data = res.data;
    return Array.isArray(data) ? data as QueueAgent[] : (data?.results ?? []) as QueueAgent[];
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
    const data = res.data;
    return Array.isArray(data) ? data as QueueTeam[] : (data?.results ?? []) as QueueTeam[];
  }

  static async assignTeam(queueId: number, teamId: number) {
    const res = await api.post<QueueTeam>(`${BASE}/queues/${queueId}/teams/`, { team: teamId });
    return res.data;
  }

  static async removeTeam(queueId: number, assignmentId: number) {
    await api.delete(`${BASE}/queues/${queueId}/teams/${assignmentId}/`);
  }

  // ── Invitations ─────────────────────────────────────────────────────────

  static async getInvitations(projectId: number) {
    const res = await api.get(`${BASE}/projects/${projectId}/invitations/`);
    const data = res.data;
    return Array.isArray(data) ? data as CSMInvitation[] : (data?.results ?? []) as CSMInvitation[];
  }

  static async sendInvitation(data: CreateInvitationData) {
    const res = await api.post<CSMInvitation>(`${BASE}/projects/${data.project}/invitations/`, data);
    return res.data;
  }

  static async revokeInvitation(invitationId: number) {
    await api.delete(`${BASE}/invitations/${invitationId}/`);
  }

  static async acceptInvitation(token: string) {
    const res = await api.post<CSMInvitation>(`${BASE}/invitations/accept/`, { token });
    return res.data;
  }
}
