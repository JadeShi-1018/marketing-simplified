import { cookies } from 'next/headers';
import { DashboardPanelPreferenceProvider } from '@/components/dashboard/DashboardPanelPreferenceContext';
import {
  UPCOMING_MEETINGS_PANEL_STORAGE_KEY,
  normalizeUpcomingMeetingsPanelOpen,
} from '@/lib/dashboardPanelPreferences';

export default async function ProjectLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const initialUpcomingMeetingsPanelOpen = normalizeUpcomingMeetingsPanelOpen(
    cookieStore.get(UPCOMING_MEETINGS_PANEL_STORAGE_KEY)?.value
  );

  return (
    <DashboardPanelPreferenceProvider
      initialUpcomingMeetingsPanelOpen={initialUpcomingMeetingsPanelOpen}
    >
      {children}
    </DashboardPanelPreferenceProvider>
  );
}
