import api from "../api";
import type {
  BehavioralSignal,
  BehavioralSignalInput,
  CreateFocusSessionRequest,
  FocusSession,
  PaginatedFocusSessions,
  PaginatedSignals,
} from "@/types/behavioralTracking";

const BASE = "/api/behavioral-tracking/sessions";

export const BehavioralTrackingAPI = {
  createSession: (task: number) =>
    api.post<FocusSession>(`${BASE}/`, { task } satisfies CreateFocusSessionRequest),

  listSessions: (params?: { task_id?: number; page?: number }) =>
    api.get<PaginatedFocusSessions>(`${BASE}/`, { params }),

  getSession: (id: number) => api.get<FocusSession>(`${BASE}/${id}/`),

  endSession: (id: number) => api.post<FocusSession>(`${BASE}/${id}/end/`),

  postSignals: (id: number, signals: BehavioralSignalInput[]) =>
    api.post<BehavioralSignal[]>(`${BASE}/${id}/signals/`, { signals }),

  getSignals: (id: number, params?: { page?: number }) =>
    api.get<PaginatedSignals>(`${BASE}/${id}/signals/`, { params }),
};
