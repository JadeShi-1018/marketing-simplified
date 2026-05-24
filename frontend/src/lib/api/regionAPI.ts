import api from '../api';
import { Region, CreateRegionData, UpdateRegionData } from '@/types/region'
const BASE = '/api/regions';
type PaginatedRegions = {
  count: number;
  next: string | null;
  previous: string | null;
  results: Region[];
};
export const RegionAPI = {
  list: (params?: { project?: number; is_active?: boolean }) =>
    api.get<PaginatedRegions | Region[]>(`${BASE}/`, { params }),

  retrieve: (id: number) =>
    api.get<Region>(`${BASE}/${id}/`),

  create: (data: CreateRegionData, projectId: number) =>
    api.post<Region>(`${BASE}/`, data, { params: { project: projectId } }),

  update: (id: number, data: UpdateRegionData) =>
    api.patch<Region>(`${BASE}/${id}/`, data),

  destroy: (id: number) =>
    api.delete(`${BASE}/${id}/`),
}