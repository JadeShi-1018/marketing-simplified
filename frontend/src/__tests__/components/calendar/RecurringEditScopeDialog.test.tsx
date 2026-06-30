import { fireEvent, render, screen } from '@testing-library/react';
import { RecurringEditScopeDialog } from '@/components/calendar/RecurringEditScopeDialog';

describe('RecurringEditScopeDialog', () => {
  it('renders nothing when closed', () => {
    render(
      <RecurringEditScopeDialog
        open={false}
        onCancel={jest.fn()}
        onConfirm={jest.fn()}
      />,
    );

    expect(screen.queryByTestId('recurring-scope-dialog')).not.toBeInTheDocument();
  });

  it('confirms the default "this" scope when the user does not change the selection', () => {
    const onConfirm = jest.fn();
    render(
      <RecurringEditScopeDialog
        open
        onCancel={jest.fn()}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByTestId('recurring-scope-dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('recurring-scope-confirm'));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith('this');
  });

  it('confirms the chosen scope after the user selects an option', () => {
    const onConfirm = jest.fn();
    render(
      <RecurringEditScopeDialog
        open
        onCancel={jest.fn()}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(
      screen.getByTestId('recurring-scope-option-future').querySelector('input')!,
    );
    fireEvent.click(screen.getByTestId('recurring-scope-confirm'));

    expect(onConfirm).toHaveBeenCalledWith('future');
  });

  it('invokes onCancel without confirming when cancelled', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    render(
      <RecurringEditScopeDialog
        open
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByTestId('recurring-scope-cancel'));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('honors a non-default initial scope', () => {
    const onConfirm = jest.fn();
    render(
      <RecurringEditScopeDialog
        open
        defaultScope="all"
        onCancel={jest.fn()}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByTestId('recurring-scope-confirm'));

    expect(onConfirm).toHaveBeenCalledWith('all');
  });
});
