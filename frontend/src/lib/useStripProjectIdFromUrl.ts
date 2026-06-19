'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * SMP-539: `?project_id=` must never appear in browser URLs. Strip it on every route
 * without reading it for app logic (project comes from the Zustand store).
 */
export function useStripProjectIdFromUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!searchParams?.get('project_id')) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete('project_id');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);
}
