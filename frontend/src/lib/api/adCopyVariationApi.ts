import api from '@/lib/api';
import type {
  AdCopyVariation,
  AdCopyVariationCopy,
  GenerateVariationRequest,
  SaveVariationRequest,
} from '@/types/adCopyVariation';

const BASE = '/api/ad_copy_variation/variations';

export async function generateVariation(
  req: GenerateVariationRequest
): Promise<AdCopyVariationCopy> {
  const { data } = await api.post<AdCopyVariationCopy>(`${BASE}/generate/`, req);
  return data;
}

export async function saveVariation(
  req: SaveVariationRequest
): Promise<AdCopyVariation> {
  const { data } = await api.post<AdCopyVariation>(`${BASE}/`, req);
  return data;
}

export interface ListVariationsResult {
  results: AdCopyVariation[];
  total: number;
}

export async function listVariations(
  creativeId: number,
  opts?: { limit?: number }
): Promise<ListVariationsResult> {
  const params: Record<string, string | number> = { creative: creativeId };
  if (opts?.limit) params.page_size = opts.limit;
  const { data } = await api.get(`${BASE}/`, { params });
  if (Array.isArray(data)) {
    return { results: data as AdCopyVariation[], total: data.length };
  }
  if (data && Array.isArray((data as { results?: unknown }).results)) {
    const paged = data as { results: AdCopyVariation[]; count?: number };
    return {
      results: paged.results,
      total: typeof paged.count === "number" ? paged.count : paged.results.length,
    };
  }
  return { results: [], total: 0 };
}

export async function updateVariation(
  id: number,
  fields: Partial<AdCopyVariationCopy>
): Promise<AdCopyVariation> {
  const { data } = await api.patch<AdCopyVariation>(`${BASE}/${id}/`, fields);
  return data;
}

export async function deleteVariation(id: number): Promise<void> {
  await api.delete(`${BASE}/${id}/`);
}
