import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import AuditLogFilterBar from '@/components/audit/AuditLogFilterBar';
import type { AuditLogFilters } from '@/types/audit';

describe('AuditLogFilterBar', () => {
  const emptyFilters: AuditLogFilters = {};

  it('renders the Filters button', () => {
    render(<AuditLogFilterBar filters={emptyFilters} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /Filters/i })).toBeInTheDocument();
  });

  it('does not show filter badge when no filters are active', () => {
    render(<AuditLogFilterBar filters={emptyFilters} onChange={() => {}} />);
    // The numeric badge should not be present
    expect(screen.queryByText('1')).not.toBeInTheDocument();
    expect(screen.queryByText('2')).not.toBeInTheDocument();
  });

  it('shows filter count badge when event_type filter is active', () => {
    render(
      <AuditLogFilterBar
        filters={{ event_type: ['meeting.title_changed'] }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('shows count badge of 2 when event_type and actor_id are both set', () => {
    render(
      <AuditLogFilterBar
        filters={{ event_type: ['meeting.title_changed'], actor_id: 5 }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('opens dropdown when Filters button is clicked', () => {
    render(<AuditLogFilterBar filters={emptyFilters} onChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Filters/i }));
    expect(screen.getByText('Event Types')).toBeInTheDocument();
  });

  it('closes dropdown when overlay is clicked', () => {
    render(<AuditLogFilterBar filters={emptyFilters} onChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Filters/i }));
    expect(screen.getByText('Event Types')).toBeInTheDocument();
    // Click the fixed overlay
    const overlay = document.querySelector('.fixed.inset-0.z-10') as HTMLElement;
    fireEvent.click(overlay);
    expect(screen.queryByText('Event Types')).not.toBeInTheDocument();
  });

  it('calls onChange with the selected event type when a checkbox is clicked', () => {
    const onChange = jest.fn();
    render(<AuditLogFilterBar filters={emptyFilters} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Filters/i }));
    const checkbox = screen.getByLabelText('Title changed');
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: ['meeting.title_changed'] }),
    );
  });

  it('removes an event type when its checkbox is unchecked', () => {
    const onChange = jest.fn();
    render(
      <AuditLogFilterBar
        filters={{ event_type: ['meeting.title_changed'] }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Filters/i }));
    const checkbox = screen.getByLabelText('Title changed');
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: undefined }),
    );
  });

  it('shows "No actors in log yet" placeholder when actors list is empty', () => {
    render(<AuditLogFilterBar filters={emptyFilters} onChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Filters/i }));
    expect(screen.getByText(/No actors in log yet/i)).toBeInTheDocument();
  });

  it('calls onChange with actor_id when an actor is selected from the dropdown', () => {
    const onChange = jest.fn();
    const actors = [{ id: 7, display_name: 'Alice' }];
    render(<AuditLogFilterBar filters={emptyFilters} onChange={onChange} actors={actors} />);
    fireEvent.click(screen.getByRole('button', { name: /Filters/i }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '7' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ actor_id: 7 }));
  });

  it('clears actor_id when "All actors" is selected', () => {
    const onChange = jest.fn();
    const actors = [{ id: 7, display_name: 'Alice' }];
    render(
      <AuditLogFilterBar filters={{ actor_id: 7 }} onChange={onChange} actors={actors} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Filters/i }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ actor_id: undefined }));
  });

  it('shows actor chip with display name and removes it when X is clicked', () => {
    const onChange = jest.fn();
    const actors = [{ id: 42, display_name: 'Alice Chen' }];
    render(
      <AuditLogFilterBar filters={{ actor_id: 42 }} onChange={onChange} actors={actors} />,
    );
    expect(screen.getByText('Alice Chen')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Remove actor filter'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ actor_id: undefined }));
  });

  it('shows "Clear all" button when filters are active and calls onChange with empty filters', () => {
    const onChange = jest.fn();
    render(
      <AuditLogFilterBar
        filters={{ actor_id: 1, event_type: ['meeting.title_changed'] }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText('Clear all'));
    expect(onChange).toHaveBeenCalledWith({
      event_type: undefined,
      actor_id: undefined,
      from: undefined,
      to: undefined,
    });
  });

  it('calls onChange with from date when From input changes', () => {
    const onChange = jest.fn();
    render(<AuditLogFilterBar filters={emptyFilters} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Filters/i }));
    const fromInput = screen.getByLabelText('From');
    fireEvent.change(fromInput, { target: { value: '2026-05-01' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ from: '2026-05-01T00:00:00Z' }),
    );
  });

  it('shows date range chip when from filter is set', () => {
    render(
      <AuditLogFilterBar
        filters={{ from: '2026-05-01T00:00:00Z' }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('Date range')).toBeInTheDocument();
  });
});
