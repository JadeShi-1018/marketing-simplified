import api from '../api';
import {
  CustomerStatusLabel,
  CreateStatusLabelData,
  UpdateStatusLabelData,
} from '@/types/customer';

const BASE = '/api/customer-status-labels';

function unwrap<T>(data: unknown): T[] {
  return Array.isArray(data) ? data : ((data as { results?: T[] })?.results ?? []);
}

export const CustomerStatusLabelAPI = {
  // Project-scoped: list/create/reorder require ?project={id}.
  list: (projectId: number) =>
    api
      .get<CustomerStatusLabel[] | { results: CustomerStatusLabel[] }>(`${BASE}/`, {
        params: { project: projectId },
      })
      .then((res) => unwrap<CustomerStatusLabel>(res.data)),

  create: (projectId: number, data: CreateStatusLabelData) =>
    api.post<CustomerStatusLabel>(`${BASE}/`, data, { params: { project: projectId } }),

  update: (id: number, data: UpdateStatusLabelData) =>
    api.patch<CustomerStatusLabel>(`${BASE}/${id}/`, data),

  destroy: (id: number, opts?: { force?: boolean }) =>
    api.delete(`${BASE}/${id}/`, opts?.force ? { params: { force: true } } : undefined),

  reorder: (projectId: number, ids: number[]) =>
    api.put<CustomerStatusLabel[]>(`${BASE}/reorder/`, { ids }, { params: { project: projectId } }),
};
