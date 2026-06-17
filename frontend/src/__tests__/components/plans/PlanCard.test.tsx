import { fireEvent, render, screen } from '@testing-library/react';
import PlanCard from '@/components/plans/PlanCard';

describe('PlanCard', () => {
  it('uses the seat calculator total as the Team headline price', () => {
    render(
      <PlanCard
        name="Team"
        description="Built for growing advertising teams."
        basePriceCents={4_900}
        monthlyTokenQuota={5_000_000}
        includedSeats={5}
        extraSeatPriceCents={900}
        overagePriceCentsPer1m={500}
        currency="AUD"
        ctaText="Start Team"
        planId={1}
        variant="card"
      />,
    );

    expect(screen.getByText('$94 AUD')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('slider', { name: 'Seats' }), { target: { value: '16' } });

    expect(screen.getByText('$148 AUD')).toBeInTheDocument();
  });
});
