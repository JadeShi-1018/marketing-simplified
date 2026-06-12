'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { getVariation } from '@/lib/api/adCopyVariationApi';

/**
 * Slug entry point for ad copy variations (SMP-539).
 * Resolves the variation by slug, then hands off to the studio workspace.
 */
export default function VariationSlugPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params?.slug ? String(params.slug) : null;
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    getVariation(slug)
      .then((variation) => {
        if (cancelled) return;
        router.replace(`/variations-studio?creative=${variation.id}`);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, router]);

  if (notFound) {
    return (
      <div className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-2 text-gray-500">
        <p className="text-sm font-medium">Variation not found.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[50vh] items-center justify-center text-gray-400">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
    </div>
  );
}
