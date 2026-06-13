'use client';

import { useCallback, useEffect, useState } from 'react';
import type { GenerationOutputKey } from '@/types/agent';
import {
  DEFAULT_GENERATION_OUTPUTS,
  GENERATION_OUTPUT_STORAGE_KEY,
  parseStoredGenerationOutputs,
} from '@/lib/generationOutputs';

export function useGenerationOutputs() {
  const [selected, setSelectedState] = useState<GenerationOutputKey[]>(
    DEFAULT_GENERATION_OUTPUTS
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setSelectedState(
      parseStoredGenerationOutputs(localStorage.getItem(GENERATION_OUTPUT_STORAGE_KEY))
    );

    const onChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ outputs?: GenerationOutputKey[] }>).detail;
      if (detail?.outputs?.length) {
        setSelectedState(detail.outputs);
      }
    };
    window.addEventListener('agent:generation-outputs-changed', onChanged);
    return () => window.removeEventListener('agent:generation-outputs-changed', onChanged);
  }, []);

  const applySelection = useCallback((outputs: GenerationOutputKey[]) => {
    if (outputs.length === 0) return;
    setSelectedState(outputs);
    if (typeof window !== 'undefined') {
      localStorage.setItem(GENERATION_OUTPUT_STORAGE_KEY, JSON.stringify(outputs));
      window.dispatchEvent(
        new CustomEvent('agent:generation-outputs-changed', { detail: { outputs } })
      );
    }
  }, []);

  return { selected, applySelection };
}
