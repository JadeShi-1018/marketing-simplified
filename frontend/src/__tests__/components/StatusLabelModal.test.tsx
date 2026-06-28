import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import StatusLabelModal from '@/components/csm-settings/status-labels/StatusLabelModal';
import { CustomerStatusLabelAPI } from '@/lib/api/customerStatusLabelApi';

jest.mock('@/lib/api/customerStatusLabelApi', () => ({
  CustomerStatusLabelAPI: {
    create: jest.fn(),
    update: jest.fn(),
  },
}));

// Modal renders children directly; stub to avoid portal/overlay concerns.
jest.mock('@/components/ui/Modal', () => ({
  __esModule: true,
  default: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <div>{children}</div> : null,
}));

const mockedAPI = CustomerStatusLabelAPI as jest.Mocked<typeof CustomerStatusLabelAPI>;

describe('StatusLabelModal', () => {
  beforeEach(() => jest.clearAllMocks());

  const baseProps = {
    isOpen: true,
    projectId: 7,
    editing: null,
    onClose: jest.fn(),
    onSaved: jest.fn(),
  };

  test('blocks submit when name is empty', async () => {
    render(<StatusLabelModal {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /create/i }));
    expect(await screen.findByText('Name is required.')).toBeInTheDocument();
    expect(mockedAPI.create).not.toHaveBeenCalled();
  });

  test('creates a label with name and color', async () => {
    mockedAPI.create.mockResolvedValue({
      data: { id: 1, name: 'Gold', color: '#E0A800' },
    } as never);
    const onSaved = jest.fn();
    render(<StatusLabelModal {...baseProps} onSaved={onSaved} />);

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Gold' } });
    fireEvent.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => expect(mockedAPI.create).toHaveBeenCalledTimes(1));
    const [projectArg, payload] = mockedAPI.create.mock.calls[0];
    expect(projectArg).toBe(7);
    expect(payload.name).toBe('Gold');
    expect(payload.color).toMatch(/^#/);
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  test('updates an existing label instead of creating', async () => {
    mockedAPI.update.mockResolvedValue({
      data: { id: 5, name: 'Premium', color: '#3CCED7' },
    } as never);
    render(
      <StatusLabelModal
        {...baseProps}
        editing={{
          id: 5,
          project: 7,
          name: 'Gold',
          color: '#E0A800',
          order: 0,
          is_active: true,
          created_at: '',
          updated_at: '',
        }}
      />,
    );

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Premium' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(mockedAPI.update).toHaveBeenCalledWith(5, expect.objectContaining({ name: 'Premium' })));
    expect(mockedAPI.create).not.toHaveBeenCalled();
  });
});
