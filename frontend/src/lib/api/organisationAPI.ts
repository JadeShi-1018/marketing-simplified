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
  list: () =>
    api.get<PaginatedOrganisations | Organisation[]>(`${BASE}/`),

  retrieve: (id: number) =>
    api.get<Organisation>(`${BASE}/${id}/`),

  create: (data: CreateOrganisationData) =>
    api.post<Organisation>(`${BASE}/`, data),

  update: (id: number, data: UpdateOrganisationData) =>
    api.patch<Organisation>(`${BASE}/${id}/`, data),

  destroy: (id: number) =>
    api.delete(`${BASE}/${id}/`),

  myAdminOrgs: () =>
    api.get<{ id: number; name: string }[]>(`${BASE}/my-admin-orgs/`),
}