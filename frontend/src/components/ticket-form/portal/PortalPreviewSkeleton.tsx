'use client';

import { Skeleton } from '@/components/ui/skeleton';

interface Props {
  /** When false, skip the experience-group name skeleton (name is already shown). */
  showBrandingSkeleton?: boolean;
}

/** Portal preview loading state — same skeleton animation as task drawer. */
export default function PortalPreviewSkeleton({
  showBrandingSkeleton = true,
}: Props) {
  return (
    <div
      className="flex flex-col gap-6"
      aria-busy="true"
      aria-label="Loading preview"
      data-testid="portal-preview-skeleton"
    >
      {showBrandingSkeleton ? <Skeleton className="h-6 w-40" /> : null}

      <div className="space-y-2">
        <Skeleton className="h-9 w-3/4 max-w-md" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>

      <div className="space-y-6">
        {[0, 1, 2, 3].map((key) => (
          <div key={key} className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
        ))}

        <div className="flex justify-end pt-2">
          <Skeleton className="h-10 w-24 rounded-md" />
        </div>
      </div>
    </div>
  );
}
