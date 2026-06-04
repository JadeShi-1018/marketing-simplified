import { create } from 'zustand';
import { Queue, QueueTicketCounts } from '@/types/csm';
import CsmAPI from './api/csmApi';

interface CsmState {
  // Data
  queues: Queue[];
  ticketCounts: Record<number, QueueTicketCounts>; // keyed by queue id

  // Loading states
  queuesLoading: boolean;

  // Error states
  queuesError: string | null;

  // Actions
  fetchQueues: (params?: { organisation?: number }) => Promise<void>;
  fetchTicketCounts: (queueId: number) => Promise<void>;
  fetchAllTicketCounts: () => Promise<void>;
  reset: () => void;
}

export const useCsmStore = create<CsmState>((set, get) => ({
  queues: [],
  ticketCounts: {},
  queuesLoading: false,
  queuesError: null,

  fetchQueues: async (params?: { organisation?: number }) => {
    set({ queuesLoading: true, queuesError: null });
    try {
      const queues = await CsmAPI.getQueues(params);
      set({ queues, queuesLoading: false });
    } catch (err: any) {
      set({
        queuesError: err?.response?.data?.detail || 'Failed to load queues',
        queuesLoading: false,
      });
    }
  },

  fetchTicketCounts: async (queueId: number) => {
    try {
      const counts = await CsmAPI.getTicketCounts(queueId);
      set((state) => ({
        ticketCounts: { ...state.ticketCounts, [queueId]: counts },
      }));
    } catch {
      // Silently fail for ticket counts - not critical
    }
  },

  fetchAllTicketCounts: async () => {
    const { queues } = get();
    await Promise.all(queues.map((q) => get().fetchTicketCounts(q.id)));
  },

  reset: () => {
    set({
      queues: [],
      ticketCounts: {},
      queuesLoading: false,
      queuesError: null,
    });
  },
}));
