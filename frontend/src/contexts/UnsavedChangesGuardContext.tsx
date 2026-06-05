'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';

type ConfirmNavigation = (action: () => void) => void;

const UnsavedChangesGuardContext = createContext<ConfirmNavigation | null>(
  null,
);

export function UnsavedChangesGuardProvider({
  confirmNavigation,
  children,
}: {
  confirmNavigation: ConfirmNavigation;
  children: ReactNode;
}) {
  const value = useCallback<ConfirmNavigation>(
    (action) => confirmNavigation(action),
    [confirmNavigation],
  );

  const memoized = useMemo(() => value, [value]);

  return (
    <UnsavedChangesGuardContext.Provider value={memoized}>
      {children}
    </UnsavedChangesGuardContext.Provider>
  );
}

export function useUnsavedChangesGuardContext(): ConfirmNavigation | null {
  return useContext(UnsavedChangesGuardContext);
}

export function useGuardedRouterPush(
  push: (href: string) => void,
): (href: string) => void {
  const confirmNavigation = useUnsavedChangesGuardContext();

  return useCallback(
    (href: string) => {
      if (!confirmNavigation) {
        push(href);
        return;
      }
      confirmNavigation(() => push(href));
    },
    [confirmNavigation, push],
  );
}
