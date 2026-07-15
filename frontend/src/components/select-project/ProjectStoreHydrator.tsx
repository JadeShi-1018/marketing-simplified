'use client';

import { ReactNode, useRef } from 'react';
import { useProjectStore } from '@/lib/projectStore';
import type { ProjectData } from '@/lib/api/projectApi';

type ProjectStoreHydratorProps = {
  initialActiveProject: ProjectData | null;
  children: ReactNode;
};

export default function ProjectStoreHydrator({
  initialActiveProject,
  children,
}: ProjectStoreHydratorProps) {
  const initialized = useRef(false);

  if (!initialized.current && initialActiveProject) {
    useProjectStore.setState({
      activeProject: initialActiveProject,
      hasHydrated: true,
    });

    initialized.current = true;
  }

  return <>{children}</>;
}