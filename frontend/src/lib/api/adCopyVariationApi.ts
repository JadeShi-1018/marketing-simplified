import api from '@/lib/api';
import type {
  AdCopyVariation,
  AdCopyVariationCopy,
  AdCopyVariationSourceMode,
  AdCopyVariationStatus,
  BatchGenerateResponse,
  GenerateVariationRequest,
  SaveVariationRequest,
} from '@/types/adCopyVariation';

const BASE = '/api/ad_copy_variation/variations';

export async function generateVariation(
  req: GenerateVariationRequest
): Promise<BatchGenerateResponse> {
  const body = { ...req, count: req.count ?? 1 };
  const { data } = await api.post(`${BASE}/generate/`, body);
  const results = (data as { results?: unknown }).results;
  if (
    data &&
    Array.isArray(results) &&
    results.every((row) => {
      if (typeof row !== 'object' || row === null) return false;
      const candidate = row as { id?: unknown; status?: unknown };
      return typeof candidate.id === 'number' && typeof candidate.status === 'string';
    })
  ) {
    return data as BatchGenerateResponse;
  }
  throw new Error(
    'Generate response did not include persisted draft IDs. Please restart the backend and ensure migrations are applied.'
  );
}

export async function saveVariation(
  req: SaveVariationRequest
): Promise<AdCopyVariation> {
  const { data } = await api.post<AdCopyVariation>(`${BASE}/`, req);
  return data;
}

export async function bulkSaveVariations(
  items: SaveVariationRequest[]
): Promise<{ saved: AdCopyVariation[]; failedIndices: number[] }> {
  const saved: AdCopyVariation[] = new Array(items.length) as AdCopyVariation[];
  const failedIndices: number[] = [];
  await Promise.all(
    items.map(async (item, idx) => {
      try {
        const v = await saveVariation(item);
        saved[idx] = v;
      } catch (_err) {
        failedIndices.push(idx);
      }
    })
  );
  const cleanSaved = saved.filter((v): v is AdCopyVariation => Boolean(v));
  failedIndices.sort((a, b) => a - b);
  return { saved: cleanSaved, failedIndices };
}

export interface ListVariationsResult {
  results: AdCopyVariation[];
  total: number;
  page?: number;
  pageSize?: number;
}

export interface ListAiVariationsParams {
  project_id?: number;
  creative?: number;
  status?: AdCopyVariationStatus | AdCopyVariationStatus[] | string;
  source_mode?: AdCopyVariationSourceMode | '';
  batch_id?: string;
  page?: number;
  page_size?: number;
}

export async function listVariations(
  creativeId: number,
  opts?: { limit?: number }
): Promise<ListVariationsResult> {
  return listAiVariations({ creative: creativeId, page_size: opts?.limit });
}

export async function listAiVariations(
  params: ListAiVariationsParams
): Promise<ListVariationsResult> {
  const normalized: Record<string, string | number> = {};
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    normalized[key] = Array.isArray(value) ? value.join(',') : value;
  });
  const { data } = await api.get(`${BASE}/`, { params: normalized });
  if (Array.isArray(data)) {
    return { results: data as AdCopyVariation[], total: data.length };
  }
  if (data && Array.isArray((data as { results?: unknown }).results)) {
    const paged = data as {
      results: AdCopyVariation[];
      count?: number;
      page?: number;
      page_size?: number;
    };
    return {
      results: paged.results,
      total: typeof paged.count === 'number' ? paged.count : paged.results.length,
      page: paged.page,
      pageSize: paged.page_size,
    };
  }
  return { results: [], total: 0 };
}

export async function getLatestVariationBatch(projectId: number): Promise<{
  batch_id: string | null;
  count: number;
  results: AdCopyVariation[];
}> {
  const { data } = await api.get(`${BASE}/latest_batch/`, {
    params: { project_id: projectId },
  });
  return data;
}

export async function reviewVariationBatch(req: {
  project_id: number;
  batch_id: string;
  selected_ids: number[];
}): Promise<{
  batch_id: string;
  reviewed_count: number;
  results: AdCopyVariation[];
}> {
  const { data } = await api.post(`${BASE}/review_batch/`, req);
  return data;
}

export async function updateVariation(
  id: number,
  fields: Partial<AdCopyVariationCopy & Pick<AdCopyVariation, 'status'>>
): Promise<AdCopyVariation> {
  const { data } = await api.patch<AdCopyVariation>(`${BASE}/${id}/`, fields);
  return data;
}

export async function deleteVariation(id: number): Promise<void> {
  await api.delete(`${BASE}/${id}/`);
}
