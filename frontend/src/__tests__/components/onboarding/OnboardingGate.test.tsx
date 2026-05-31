import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OnboardingGate from '@/components/onboarding/OnboardingGate';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  usePathname: () => '/overview',
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/lib/authStore', () => ({
  useAuthStore: (selector: (state: { clearAuth: () => void }) => unknown) =>
    selector({ clearAuth: jest.fn() }),
}));

jest.mock('@/contexts/OnboardingContext', () => ({
  useOnboarding: () => ({
    needsOnboarding: true,
    checking: false,
  }),
}));

jest.mock('@/components/onboarding/OnboardingWizard', () => ({
  __esModule: true,
  default: ({ onExit }: { onExit?: () => void }) => (
    <div data-testid="classic-onboarding-wizard">
      Classic wizard
      {onExit ? (
        <button type="button" onClick={onExit}>
          Exit classic setup
        </button>
      ) : null}
    </div>
  ),
}));

describe('OnboardingGate', () => {
  beforeEach(() => {
    mockPush.mockReset();
  });

  it('shows project creation chooser when onboarding is required', () => {
    render(
      <OnboardingGate>
        <div>App content</div>
      </OnboardingGate>
    );

    expect(screen.getByRole('heading', { name: /set up your first project/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /get started/i })).toBeInTheDocument();
  });

  it('navigates to quick start from chooser', async () => {
    const user = userEvent.setup();
    render(
      <OnboardingGate>
        <div>App content</div>
      </OnboardingGate>
    );

    await user.click(screen.getByRole('button', { name: /get started/i }));

    expect(mockPush).toHaveBeenCalledWith('/projects/quick-start');
  });

  it('opens classic wizard from chooser', async () => {
    const user = userEvent.setup();
    render(
      <OnboardingGate>
        <div>App content</div>
      </OnboardingGate>
    );

    await user.click(screen.getByRole('button', { name: /use classic wizard/i }));

    expect(screen.getByTestId('classic-onboarding-wizard')).toBeInTheDocument();
  });

  it('returns to chooser when classic wizard exit is clicked', async () => {
    const user = userEvent.setup();
    render(
      <OnboardingGate>
        <div>App content</div>
      </OnboardingGate>
    );

    await user.click(screen.getByRole('button', { name: /use classic wizard/i }));
    expect(screen.getByTestId('classic-onboarding-wizard')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /exit classic setup/i }));

    expect(screen.getByRole('heading', { name: /set up your first project/i })).toBeInTheDocument();
    expect(screen.queryByTestId('classic-onboarding-wizard')).not.toBeInTheDocument();
  });
});
