import api from '../api';
import { Organisation, CreateOrganisationData, UpdateOrganisationData } from '@/types/organisation'

const BASE = '/api/organisations';

type PaginatedOrganisations = {
  count: number;
  next: string | null;
  previous: string | null;
  results: Organisation[];
};
export const OrganisationAPI = {
  list: (params?: { project?: number; is_active?: boolean }) =>
    api.get<PaginatedOrganisations | Organisation[]>(`${BASE}/`, { params }),

  retrieve: (id: number) =>
    api.get<Organisation>(`${BASE}/${id}/`),

  create: (data: CreateOrganisationData, projectId: number) =>
    api.post<Organisation>(`${BASE}/`, data, { params: { project: projectId } }),

  update: (id: number, data: UpdateOrganisationData) =>
    api.patch<Organisation>(`${BASE}/${id}/`, data),

  destroy: (id: number) =>
    api.delete(`${BASE}/${id}/`),
}