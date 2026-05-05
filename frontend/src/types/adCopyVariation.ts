export type AdCopyVariationSourceMode = 'existing' | 'custom' | 'external_url';

export interface AdCopyVariationCopy {
  hook: string;
  headline: string;
  description: string;
  cta: string;
}

export interface AdCopyVariation extends AdCopyVariationCopy {
  id: number;
  creative: number | null;
  source_mode: AdCopyVariationSourceMode;
  source_ref: string;
  instruction: string;
  model_name: string;
  prompt_version: string;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface GenerateVariationRequest {
  source_mode: AdCopyVariationSourceMode;
  creative_id?: number;
  base_copy?: AdCopyVariationCopy;
  url?: string;
  instruction?: string;
}

export interface SaveVariationRequest extends AdCopyVariationCopy {
  source_mode: AdCopyVariationSourceMode;
  creative?: number | null;
  source_ref?: string;
  instruction?: string;
}
