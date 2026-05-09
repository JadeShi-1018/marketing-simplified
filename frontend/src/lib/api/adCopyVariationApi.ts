import api from '@/lib/api';
import type {
  AdCopyVariation,
  AdCopyVariationCopy,
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
  if (data && Array.isArray((data as { results?: unknown }).results)) {
    return data as BatchGenerateResponse;
  }
  // Backend backward-compat path: count=1 returns flat {hook, headline, description, cta}.
  // Wrap into BatchGenerateResponse so callers always handle one shape.
  const flat = data as AdCopyVariationCopy;
  return {
    batch_id: '',
    count_requested: 1,
    count_succeeded: 1,
    count_failed: 0,
    results: [flat],
    failed_indices: [],
  };
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
      total: typeof paged.count === 'number' ? paged.count : paged.results.length,
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
