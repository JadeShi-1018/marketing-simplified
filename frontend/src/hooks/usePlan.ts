import { useState, useEffect } from 'react';
import api, { authAPI } from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/lib/authStore';

interface Plan {
  id: number;
  name: string;
  desc: string | null;
  stripe_price_id: string | null;
  // Token-billing schema
  base_price_cents: number;
  monthly_token_quota: number | null;  // null = unlimited
  included_seats: number;
  extra_seat_price_cents: number | null;
  overage_price_cents_per_1m: number | null;  // null = hard block
  is_archived: boolean;
  // Legacy (deprecated — do not use for rendering)
  max_team_members?: number | null;
  max_previews_per_day?: number | null;
  max_tasks_per_day?: number | null;
}

interface SwitchPlanResponse {
  requested: boolean;
  redirect_to?: 'checkout' | null;
  status?: 'scheduled_downgrade';
  effective_at?: number | null;  // Unix timestamp
}

interface UsePlanReturn {
  plans: Plan[];
  loading: boolean;
  error: string | null;
  fetchPlans: () => Promise<void>;
  createCheckoutSession: (planId: number, seatCount?: number) => Promise<void>;
  cancelSubscription: () => Promise<void>;
  switchPlan: (planId: number) => Promise<SwitchPlanResponse>;
  handleSubscribe: (planId: number, seatCount?: number) => Promise<void>;
}

export default function usePlan(enabled = true): UsePlanReturn {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPlans = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.get('/api/stripe/plans/');
      setPlans(response.data.results || []);
    } catch (error: any) {
      const status = error?.response?.status;

      if (status === 403) {
        const { refreshOrganizationAccessToken } = useAuthStore.getState();
        const refreshResult = await refreshOrganizationAccessToken();

        if (refreshResult.success) {
          try {
            const retryResponse = await api.get('/api/stripe/plans/');
            setPlans(retryResponse.data.results || []);
            return;
          } catch (retryError: any) {
            console.error('Error fetching plans after refresh:', retryError);
          }
        }

        setError('Session expired. Please sign in again to view plans.');
        setPlans([]);
        return;
      }

      console.error('Error fetching plans:', error);
      let errorMessage = 'Failed to fetch plans';

      if (error.response?.data) {
        const errorData = error.response.data;

        if (errorData.error) {
          errorMessage = errorData.error;
        }
      }

      setError(errorMessage);
      setPlans([]);
    } finally {
      setLoading(false);
    }
  };

  const createCheckoutSession = async (planId: number, seatCount = 1) => {
    try {
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
      const response = await api.post('/api/stripe/checkout/', {
        plan_id: planId,
        seat_count: seatCount,
        success_url: `${baseUrl}/plans`,
        cancel_url: `${baseUrl}/plans`
      });

      // Backend now returns JSON with checkout_url instead of 303 redirect
      if (response.data && response.data.checkout_url) {
        window.location.href = response.data.checkout_url;
        return;
      }

      throw new Error('No checkout URL received');
    } catch (error: any) {
      console.error('Error creating checkout session:', error);
      throw error;
    }
  };

  const cancelSubscription = async () => {
    try {
      await api.post('/api/stripe/subscription/cancel/');
    } catch (error: any) {
      console.error('Error canceling subscription:', error);
      throw error;
    }
  };

  const switchPlan = async (planId: number): Promise<SwitchPlanResponse> => {
    try {
      const response = await api.post('/api/stripe/plans/switch/', {
        plan_id: planId
      });
      return response.data;
    } catch (error: any) {
      console.error('Error switching plan:', error);
      throw error;
    }
  };

  const handleSubscribe = async (planId: number, seatCount = 1) => {
    const user = useAuthStore.getState().user;
    const currentPlanId = user?.organization?.plan_id;

    // Check if user has active subscription
    if (currentPlanId) {
      // User has subscription - use switch instead of checkout
      const currentPlan = plans.find(p => p.id === currentPlanId);
      const newPlan = plans.find(p => p.id === planId);

      if (!currentPlan || !newPlan) {
        toast.error('Unable to determine plan details');
        return;
      }

      try {
        const result = await switchPlan(planId);

        // Free-sentinel org: backend cannot modify a non-existent Stripe subscription.
        // Redirect to checkout so the user creates a real one instead.
        if (result.redirect_to === 'checkout') {
          await createCheckoutSession(planId, seatCount);
          return;
        }

        // Downgrade to Free: cancel_at_period_end was set — user keeps paid benefits
        // until the billing period ends, then the subscription.deleted webhook fires.
        if (result.status === 'scheduled_downgrade') {
          const dateStr = result.effective_at
            ? new Date(result.effective_at * 1000).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
              })
            : 'the end of your billing period';
          toast.success(`Your plan will downgrade to Free on ${dateStr}. You keep your current benefits until then.`);
          return;
        }

        // Poll for plan update (webhook will have processed it)
        await new Promise<void>((resolve) => {
          let pollCount = 0;
          const maxPolls = 10; // Max 5 seconds (10 * 500ms)

          const pollInterval = setInterval(async () => {
            pollCount++;

            try {
              const user = await authAPI.getCurrentUser();

              if (user.organization?.plan_id === planId) {
                // Update auth store
                const { setUser } = useAuthStore.getState();
                setUser(user);
                // Plan switched completed
                clearInterval(pollInterval);
                toast.success('Plan switched successfully');
                resolve();
              } else if (pollCount >= maxPolls) {
                clearInterval(pollInterval);
                toast.error('Plan switch is taking longer than expected. Please refresh the page.');
                resolve(); // Still resolve to stop loading
              }
            } catch (error: any) {
              if (pollCount >= maxPolls) {
                clearInterval(pollInterval);
                toast.error('Unable to verify plan switch status. Please refresh the page.');
                resolve(); // Still resolve to stop loading
              }
            }
          }, 500);
        });
      } catch (error: any) {
        const errorMessage = error.response?.data?.error || 'Failed to switch plan';
        toast.error(errorMessage);
        throw error;
      }
    } else {
      // No subscription — only paid plans can be checked out this way
      const targetPlan = plans.find((p) => p.id === planId);
      if (!targetPlan?.stripe_price_id) return;
      await createCheckoutSession(planId, seatCount);
    }
  };

  useEffect(() => {
    if (!enabled) return;
    fetchPlans();
  }, [enabled]);

  return {
    plans,
    loading,
    error,
    fetchPlans,
    createCheckoutSession,
    cancelSubscription,
    switchPlan,
    handleSubscribe
  };
}
