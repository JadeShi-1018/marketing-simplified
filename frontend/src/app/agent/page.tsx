'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { openAgentSidePanel } from '@/lib/agentSidePanelStore';

/**
 * /agent full-page dashboard is deprecated — open the Dashboard Agent side panel instead.
 */
export default function AgentDeprecatedRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    openAgentSidePanel();
    router.replace('/overview');
  }, [router]);

  return null;
}
