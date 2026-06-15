import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import AssignmentPanel from '@/components/ticket-form/AssignmentPanel';
import { ExperienceGroupAPI } from '@/lib/api/experienceGroupApi';
import { TicketFormAPI } from '@/lib/api/ticketFormApi';

jest.mock('@/lib/api/experienceGroupApi', () => ({
  ExperienceGroupAPI: { list: jest.fn() },
}));

jest.mock('@/lib/api/ticketFormApi', () => ({
  TicketFormAPI: {
    listAssignments: jest.fn(),
    listSupportProjects: jest.fn(),
    replaceAssignments: jest.fn(),
    setDefault: jest.fn(),
  },
}));

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { success: jest.fn(), error: jest.fn() },
}));

describe('AssignmentPanel', () => {
  beforeEach(() => {
    (ExperienceGroupAPI.list as jest.Mock).mockResolvedValue({ data: [] });
    (TicketFormAPI.listAssignments as jest.Mock).mockResolvedValue({ data: [] });
    (TicketFormAPI.listSupportProjects as jest.Mock).mockResolvedValue([
      { id: 10, name: 'Billing', is_archived: false, default_queue: null },
    ]);
    (TicketFormAPI.replaceAssignments as jest.Mock).mockResolvedValue({ data: [] });
  });

  it('saves support project ids with experience groups', async () => {
    render(
      <AssignmentPanel formId={1} projectId={5} formName="Customer Request Form" isDefault={false} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Billing')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText(/Billing/i));
    fireEvent.click(screen.getByRole('button', { name: 'Save assignments' }));

    await waitFor(() => {
      expect(TicketFormAPI.replaceAssignments).toHaveBeenCalledWith(1, {
        experience_group_ids: [],
        support_project_ids: [10],
      });
    });
  });
});
