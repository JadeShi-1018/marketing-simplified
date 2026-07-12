import { useEffect } from 'react';

export function useRefetchOnFocus( hasHydrated: boolean, initialized: boolean, isAuthenticated: boolean, load: () => Promise<void>) {
useEffect(() => {
    function handleFocus() {
    if (!hasHydrated || !initialized) return;
    if (!isAuthenticated) return;
    load();
    }
    window.addEventListener('focus', handleFocus);
    return () => {
        window.removeEventListener('focus', handleFocus);
    }
}, [hasHydrated, initialized, isAuthenticated, load]);
}

