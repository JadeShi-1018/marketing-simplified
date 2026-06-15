import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import PortalFilePreviewCard, {
  truncateFilenameMiddle,
} from '@/components/ticket-form/portal/PortalFilePreviewCard';

describe('truncateFilenameMiddle', () => {
  it('keeps short filenames unchanged', () => {
    expect(truncateFilenameMiddle('report.pdf')).toBe('report.pdf');
  });

  it('truncates long filenames while preserving the extension tail', () => {
    const result = truncateFilenameMiddle('Weixin Image 202502021.jpg');
    expect(result).toContain('...');
    expect(result.endsWith('.jpg') || result.endsWith('021.jpg')).toBe(true);
  });
});

describe('PortalFilePreviewCard', () => {
  it('shows file type preview and delete button on hover', async () => {
    const file = new File(['hello'], 'notes.pdf', { type: 'application/pdf' });
    const onRemove = jest.fn();

    render(<PortalFilePreviewCard file={file} onRemove={onRemove} />);

    expect(screen.getByText('PDF')).toBeInTheDocument();
    expect(screen.getByText(/notes\.pdf/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /remove notes\.pdf/i }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
