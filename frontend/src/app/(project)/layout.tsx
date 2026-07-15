import { cookies } from 'next/headers';
import { DashboardPanelPreferenceProvider } from '@/components/dashboard/DashboardPanelPreferenceContext';
import {
  UPCOMING_MEETINGS_PANEL_STORAGE_KEY,
  normalizeUpcomingMeetingsPanelOpen,
} from '@/lib/dashboardPanelPreferences';


import ProjectStoreHydrator from '@/components/select-project/ProjectStoreHydrator';
import type { ProjectData } from '@/lib/api/projectApi';

export default async function ProjectLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();

  const initialUpcomingMeetingsPanelOpen = normalizeUpcomingMeetingsPanelOpen(
    cookieStore.get(UPCOMING_MEETINGS_PANEL_STORAGE_KEY)?.value
  );

  const activeProjectCookie = cookieStore.get('active-project')?.value;

  let initialActiveProject: ProjectData | null = null;

  if (activeProjectCookie) {
    try {
      initialActiveProject = JSON.parse(decodeURIComponent(activeProjectCookie));
    } catch {
      initialActiveProject = null;
    }
  }

  return (
    <ProjectStoreHydrator initialActiveProject={initialActiveProject}>
      <DashboardPanelPreferenceProvider
        initialUpcomingMeetingsPanelOpen={initialUpcomingMeetingsPanelOpen}
      >
        {children}
      </DashboardPanelPreferenceProvider>
    </ProjectStoreHydrator>
  );
}