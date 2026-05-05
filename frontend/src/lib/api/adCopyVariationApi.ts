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
