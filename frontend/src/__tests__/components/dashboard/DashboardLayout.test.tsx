import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { DashboardPanelPreferenceProvider } from '@/components/dashboard/DashboardPanelPreferenceContext';

jest.mock('@/components/dashboard/DashboardSidebar', () => ({
  __esModule: true,
  default: () => <div data-testid="dashboard-sidebar" />,
}));

jest.mock('@/components/dashboard/NotificationBell', () => ({
  __esModule: true,
  default: () => <div data-testid="notification-bell" />,
}));

jest.mock('@/components/agent/AgentSidePanel', () => ({
  __esModule: true,
  default: () => <div data-testid="agent-side-panel" />,
}));

jest.mock('@/lib/projectStore', () => ({
  useProjectStore: (selector: (state: { activeProject: null; hasHydrated: boolean }) => unknown) =>
    selector({ activeProject: null, hasHydrated: true }),
}));

jest.mock('@/lib/api/meetingsApi', () => ({
  MeetingsAPI: {
    listMeetingsPaginated: jest.fn(),
  },
}));

describe('DashboardLayout upcoming meetings panel preference', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('initializes the UpcomingMeetingsPanel from localStorage and persists user toggles', async () => {
    localStorage.setItem('dashboard-upcoming-meetings-panel-open', 'false');

    const { container } = render(
      <DashboardPanelPreferenceProvider initialUpcomingMeetingsPanelOpen>
        <DashboardLayout>
          <div>Page content</div>
        </DashboardLayout>
      </DashboardPanelPreferenceProvider>
    );

    const panel = container.querySelector('[data-upcoming-meetings-panel]');
    await waitFor(() => expect(panel).toHaveClass('w-0'));
    expect(screen.getByRole('button', { name: /show panel/i })).toBeInTheDocument();
    expect(screen.queryByText('Upcoming Meetings')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /show panel/i }));

    expect(panel).toHaveClass('w-[320px]');
    expect(localStorage.getItem('dashboard-upcoming-meetings-panel-open')).toBe('true');
    expect(screen.getByRole('button', { name: /hide panel/i })).toBeInTheDocument();
    expect(screen.getByText('Upcoming Meetings')).toBeInTheDocument();
  });
});
