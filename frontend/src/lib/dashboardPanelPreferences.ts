export const UPCOMING_MEETINGS_PANEL_STORAGE_KEY = 'dashboard-upcoming-meetings-panel-open';

export function normalizeUpcomingMeetingsPanelOpen(value: string | null | undefined): boolean {
  if (value === 'false') return false;
  if (value === 'true') return true;
  return true;
}
