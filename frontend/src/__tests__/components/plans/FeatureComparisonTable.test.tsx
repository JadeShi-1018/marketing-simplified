import { render, screen } from '@testing-library/react';
import FeatureComparisonTable from '@/components/plans/FeatureComparisonTable';
import { publicPricingPlans } from '@/components/plans/comparisonData';

describe('FeatureComparisonTable', () => {
  it('renders both tiers and keeps workspace modules in both plans', () => {
    render(<FeatureComparisonTable plans={publicPricingPlans} />);

    expect(screen.getByText('Free')).toBeInTheDocument();
    expect(screen.getByText('Team')).toBeInTheDocument();
    expect(screen.getByText('Core platform')).toBeInTheDocument();
    expect(screen.getByText('Content & creation')).toBeInTheDocument();
    expect(screen.getByText('Collaboration')).toBeInTheDocument();
    expect(screen.getByText('Billing & admin')).toBeInTheDocument();
    expect(screen.getByText('Campaigns')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Included')).toHaveLength(32);
    expect(screen.getByText('500K')).toBeInTheDocument();
    expect(screen.getByText('5M')).toBeInTheDocument();
  });
});
