'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import UnsavedChangesDialog from '@/components/common/UnsavedChangesDialog';

type UseUnsavedChangesGuardOptions = {
  enabled?: boolean;
};

export function useUnsavedChangesGuard(
  snapshot: unknown,
  { enabled = true }: UseUnsavedChangesGuardOptions = {},
) {
  const serializedSnapshot = JSON.stringify(snapshot);
  const serializedSnapshotRef = useRef(serializedSnapshot);
  serializedSnapshotRef.current = serializedSnapshot;

  const savedSnapshotRef = useRef<string | null>(null);
  const pendingNavigationRef = useRef<(() => void) | null>(null);
  const allowNavigationRef = useRef(false);

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const markSaved = useCallback(() => {
    savedSnapshotRef.current = serializedSnapshotRef.current;
    setHasUnsavedChanges(false);
  }, []);

  const resetBaseline = useCallback(() => {
    savedSnapshotRef.current = null;
    setHasUnsavedChanges(false);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setHasUnsavedChanges(false);
      return;
    }

    if (savedSnapshotRef.current === null) {
      savedSnapshotRef.current = serializedSnapshot;
      setHasUnsavedChanges(false);
      return;
    }

    setHasUnsavedChanges(serializedSnapshot !== savedSnapshotRef.current);
  }, [enabled, serializedSnapshot]);

  const confirmNavigation = useCallback(
    (action: () => void) => {
      if (!enabled || !hasUnsavedChanges || allowNavigationRef.current) {
        action();
        return;
      }
      pendingNavigationRef.current = action;
      setDialogOpen(true);
    },
    [enabled, hasUnsavedChanges],
  );

  const handleStay = useCallback(() => {
    pendingNavigationRef.current = null;
    setDialogOpen(false);
  }, []);

  const handleLeave = useCallback(() => {
    const action = pendingNavigationRef.current;
    pendingNavigationRef.current = null;
    setDialogOpen(false);
    if (!action) return;

    allowNavigationRef.current = true;
    action();
    queueMicrotask(() => {
      allowNavigationRef.current = false;
    });
  }, []);

  useEffect(() => {
    if (!enabled || !hasUnsavedChanges) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [enabled, hasUnsavedChanges]);

  useEffect(() => {
    if (!enabled || !hasUnsavedChanges) return;

    const handleDocumentClick = (event: MouseEvent) => {
      if (allowNavigationRef.current) return;

      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest('a[href]');
      if (!anchor) return;

      const rawHref = anchor.getAttribute('href');
      if (
        !rawHref ||
        rawHref.startsWith('#') ||
        rawHref.startsWith('mailto:') ||
        rawHref.startsWith('tel:')
      ) {
        return;
      }

      if (anchor.getAttribute('target') === '_blank') return;

      let destination = rawHref;
      try {
        const url = new URL(rawHref, window.location.origin);
        if (url.origin !== window.location.origin) return;
        destination = `${url.pathname}${url.search}${url.hash}`;
      } catch {
        return;
      }

      if (destination === window.location.pathname + window.location.search) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      confirmNavigation(() => {
        window.location.assign(destination);
      });
    };

    document.addEventListener('click', handleDocumentClick, true);
    return () => document.removeEventListener('click', handleDocumentClick, true);
  }, [confirmNavigation, enabled, hasUnsavedChanges]);

  const unsavedChangesDialog = (
    <UnsavedChangesDialog
      open={dialogOpen}
      onStay={handleStay}
      onLeave={handleLeave}
    />
  );

  return {
    hasUnsavedChanges,
    markSaved,
    resetBaseline,
    confirmNavigation,
    unsavedChangesDialog,
  };
}
