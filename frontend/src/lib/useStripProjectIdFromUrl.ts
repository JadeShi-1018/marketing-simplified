'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const STRIP_KEYS = ['project_id', 'projectId', 'project'] as const;

/**
 * Project context must not live in browser URLs on main app routes.
 * Strips legacy project query params without using them for app logic.
 */
export function useStripProjectIdFromUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!searchParams) return;
    const shouldStrip = STRIP_KEYS.some((key) => searchParams.has(key));
    if (!shouldStrip) return;

    const params = new URLSearchParams(searchParams.toString());
    for (const key of STRIP_KEYS) {
      params.delete(key);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);
}
