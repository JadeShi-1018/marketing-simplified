import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ColorPicker, {
  STATUS_LABEL_PALETTE,
} from '@/components/csm-settings/status-labels/ColorPicker';

describe('Status label ColorPicker', () => {
  test('renders one swatch per palette color', () => {
    render(<ColorPicker value={STATUS_LABEL_PALETTE[0].value} onChange={() => {}} />);
    expect(screen.getAllByRole('radio')).toHaveLength(STATUS_LABEL_PALETTE.length);
  });

  test('marks the selected color as checked', () => {
    const selected = STATUS_LABEL_PALETTE[2];
    render(<ColorPicker value={selected.value} onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: selected.name })).toBeChecked();
  });

  test('calls onChange with the clicked color value', () => {
    const onChange = jest.fn();
    const target = STATUS_LABEL_PALETTE[3];
    render(<ColorPicker value={STATUS_LABEL_PALETTE[0].value} onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: target.name }));
    expect(onChange).toHaveBeenCalledWith(target.value);
  });
});
