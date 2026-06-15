import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import PortalFileAttachment from '@/components/ticket-form/portal/PortalFileAttachment';

function createFile(name: string, sizeBytes: number, type = 'application/pdf'): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: sizeBytes });
  return file;
}

describe('PortalFileAttachment', () => {
  it('rejects files over 25 MB and reports an error message', async () => {
    const onChange = jest.fn();
    const onSizeError = jest.fn();
    render(
      <PortalFileAttachment
        inputId="field-attach"
        files={[]}
        maxTotalFiles={10}
        maxFileSizeMb={25}
        onChange={onChange}
        onSizeError={onSizeError}
      />,
    );

    const input = document.getElementById('field-attach') as HTMLInputElement;
    const oversized = createFile('large.pdf', 26 * 1024 * 1024);

    await userEvent.upload(input, oversized);

    expect(onChange).not.toHaveBeenCalled();
    expect(onSizeError).toHaveBeenCalledWith('Each file must be 25 MB or smaller.');
  });

  it('accepts files within the size limit', async () => {
    const onChange = jest.fn();
    const onSizeError = jest.fn();
    render(
      <PortalFileAttachment
        inputId="field-attach"
        files={[]}
        maxTotalFiles={10}
        maxFileSizeMb={25}
        onChange={onChange}
        onSizeError={onSizeError}
      />,
    );

    const input = document.getElementById('field-attach') as HTMLInputElement;
    const valid = createFile('small.pdf', 1024);

    await userEvent.upload(input, valid);

    expect(onChange).toHaveBeenCalledWith([valid]);
    expect(onSizeError).toHaveBeenCalledWith(null);
  });
});
