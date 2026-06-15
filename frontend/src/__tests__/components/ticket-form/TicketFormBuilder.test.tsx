import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import TicketFormBuilder from '@/components/ticket-form/TicketFormBuilder';
import { CUSTOM_FIELD_TYPE_OPTIONS } from '@/components/ticket-form/constants';
import type { TicketFormField } from '@/types/ticketForm';

jest.mock('@/lib/api/ticketFormApi', () => ({
  TicketFormAPI: { bulkFields: jest.fn() },
}));

const systemFields: TicketFormField[] = [
  { field_key: 'summary', label: 'Summary', field_type: 'system_summary', is_required: true, sort_order: 0 },
  { field_key: 'description', label: 'Description', field_type: 'system_description', is_required: true, sort_order: 1 },
  { field_key: 'project', label: 'Project', field_type: 'system_project', is_required: true, sort_order: 2 },
  { field_key: 'work_type', label: 'Work Type', field_type: 'system_work_type', is_required: true, sort_order: 3 },
];

const defaultProps = {
  formId: 1,
  projectId: 42,
  formName: 'Test form',
  formDescription: '',
  onFormNameChange: jest.fn(),
  onFormDescriptionChange: jest.fn(),
  onSaveMetadata: jest.fn(),
  onDeleteForm: jest.fn(),
};

describe('TicketFormBuilder', () => {
  it('renders all fields in one list with drag handles', () => {
    render(<TicketFormBuilder {...defaultProps} initialFields={systemFields} />);
    expect(screen.queryByText('System fields')).not.toBeInTheDocument();
    expect(screen.queryByText('Custom fields')).not.toBeInTheDocument();
    expect(screen.getAllByLabelText('Drag to reorder')).toHaveLength(4);
    expect(screen.queryByLabelText('Remove from form')).not.toBeInTheDocument();
  });

  it('renders split layout matching tasks/new shell (max-w-5xl + 280px aside)', () => {
    render(<TicketFormBuilder {...defaultProps} initialFields={systemFields} />);
    const workspace = screen.getByTestId('builder-workspace');
    expect(workspace).toHaveAttribute('data-layout-state', 'idle_wide');
    expect(workspace).toHaveClass('lg:grid-cols-[minmax(0,1fr)_280px]');
    expect(screen.getByTestId('builder-page-root')).toHaveClass('max-w-5xl');
    expect(screen.getByTestId('builder-fields-zone')).toHaveClass('lg:sticky');
    expect(screen.queryByTestId('builder-create-zone')).not.toBeInTheDocument();
  });

  it('renders all field types in the fields panel', () => {
    render(<TicketFormBuilder {...defaultProps} initialFields={systemFields} />);
    const typeList = screen.getByTestId('field-type-palette-list');
    expect(typeList).toBeInTheDocument();
    for (const opt of CUSTOM_FIELD_TYPE_OPTIONS) {
      expect(screen.getByText(opt.label)).toBeInTheDocument();
    }
  });

  it('selects field type on click without adding to canvas', () => {
    render(<TicketFormBuilder {...defaultProps} initialFields={systemFields} />);
    fireEvent.click(screen.getByText('Single-line text'));
    expect(screen.queryByDisplayValue('Single-line text')).not.toBeInTheDocument();
    expect(screen.getAllByLabelText('Drag to reorder')).toHaveLength(4);
    expect(screen.queryByLabelText('Remove from form')).not.toBeInTheDocument();
  });

  it('does not show create new field button', () => {
    render(<TicketFormBuilder {...defaultProps} initialFields={systemFields} />);
    expect(screen.queryByRole('button', { name: /Create new field/ })).not.toBeInTheDocument();
  });

  it('exposes six custom field types in constants', () => {
    expect(CUSTOM_FIELD_TYPE_OPTIONS).toHaveLength(6);
    expect(CUSTOM_FIELD_TYPE_OPTIONS.map((o) => o.value)).toEqual([
      'short_text',
      'paragraph',
      'dropdown',
      'checkbox',
      'date',
      'file',
    ]);
  });
});
