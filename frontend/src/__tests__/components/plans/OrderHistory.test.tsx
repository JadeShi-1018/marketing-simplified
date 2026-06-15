import { render, screen, waitFor } from '@testing-library/react';
import OrderHistory from '@/components/plans/OrderHistory';

describe('OrderHistory', () => {
  it('renders the empty state', async () => {
    render(<OrderHistory fetchPayments={jest.fn().mockResolvedValue([])} />);

    expect(await screen.findByText('No invoices yet')).toBeInTheDocument();
  });

  it('renders loaded invoices and receipt links', async () => {
    render(
      <OrderHistory
        fetchPayments={jest.fn().mockResolvedValue([{
          id: 'in_123',
          number: 'INV-0001',
          created: '2026-06-10T00:00:00+00:00',
          amount_paid_cents: 9400,
          currency: 'AUD',
          status: 'paid',
          description: 'Team plan - 10 seats',
          hosted_invoice_url: 'https://invoice.stripe.test/in_123',
          invoice_pdf: null,
        }])}
      />,
    );

    expect(await screen.findByText('Team plan - 10 seats')).toBeInTheDocument();
    expect(screen.getByText('$94.00 AUD')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('link', { name: 'Download INV-0001' })).toHaveAttribute('href', 'https://invoice.stripe.test/in_123'));
  });
});
