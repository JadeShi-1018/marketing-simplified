import api from '../api';

// MED-215 — ticket status machine (statuses + transitions + auto-resolution rule).
// All endpoints are project-scoped via ?project={id}.

export interface TicketStatus {
  id: number;
  slug: string;
  name: string;
  color: string;
  order: number;
  is_builtin: boolean;
  is_active: boolean;
}

export interface TicketStatusTransition {
  from_status: string;
  to_status: string;
}

export interface TicketAutoResolveConfig {
  enabled: boolean;
  days_until_resolve: number;
  notification_message: string;
}

export interface StatusMachine {
  statuses: TicketStatus[];
  transitions: TicketStatusTransition[];
  auto_resolve: TicketAutoResolveConfig;
}

const BASE = '/api/csm';

export const TicketStatusMachineAPI = {
  get: (projectId: number) =>
    api
      .get<StatusMachine>(`${BASE}/ticket-status-machine/`, { params: { project: projectId } })
      .then((res) => res.data),

  // position = insertion index in the ordered sequence.
  createStatus: (projectId: number, data: { name: string; color: string; position: number }) =>
    api
      .post<TicketStatus>(`${BASE}/ticket-statuses/`, data, { params: { project: projectId } })
      .then((res) => res.data),

  updateStatus: (id: number, data: Partial<Pick<TicketStatus, 'name' | 'color' | 'is_active'>>) =>
    api.patch<TicketStatus>(`${BASE}/ticket-statuses/${id}/`, data).then((res) => res.data),

  // Built-in statuses cannot be deleted; deleting one still in use needs confirm=true.
  deleteStatus: (projectId: number, id: number, opts?: { confirm?: boolean }) =>
    api.delete(`${BASE}/ticket-statuses/${id}/`, {
      params: { project: projectId, ...(opts?.confirm ? { confirm: true } : {}) },
    }),

  // Bulk-replace the permitted transition set; returns the whole machine.
  replaceTransitions: (projectId: number, transitions: TicketStatusTransition[]) =>
    api
      .put<StatusMachine>(`${BASE}/ticket-status-machine/`, { transitions }, { params: { project: projectId } })
      .then((res) => res.data),

  updateAutoResolve: (projectId: number, data: Partial<TicketAutoResolveConfig>) =>
    api
      .patch<TicketAutoResolveConfig>(`${BASE}/ticket-status-machine/auto-resolve/`, data, {
        params: { project: projectId },
      })
      .then((res) => res.data),
};
