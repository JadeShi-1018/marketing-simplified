import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import PortalSelect from '@/components/ticket-form/portal/PortalSelect';

const options = [
  { value: '1', label: 'Option 1' },
  { value: '2', label: 'Option 2' },
];

describe('PortalSelect', () => {
  it('opens the list and selects an option', () => {
    const onChange = jest.fn();
    render(<PortalSelect value="" options={options} onChange={onChange} />);

    expect(screen.getByRole('button', { name: /select\.\.\./i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /select\.\.\./i }));
    expect(screen.getByRole('option', { name: 'Option 1' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('option', { name: 'Option 1' }));
    expect(onChange).toHaveBeenCalledWith('1');
  });
});
