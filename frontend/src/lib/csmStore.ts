import { create } from 'zustand';
import { Queue, CSMInvitation, QueueTicketCounts } from '@/types/csm';
import CsmAPI from './api/csmApi';

interface CsmState {
  // Data
  queues: Queue[];
  invitations: CSMInvitation[];
  ticketCounts: Record<number, QueueTicketCounts>; // keyed by queue id

  // Loading states
  queuesLoading: boolean;
  invitationsLoading: boolean;

  // Error states
  queuesError: string | null;
  invitationsError: string | null;

  // Actions
  fetchQueues: (projectId: number) => Promise<void>;
  fetchInvitations: (projectId: number) => Promise<void>;
  fetchTicketCounts: (queueId: number) => Promise<void>;
  fetchAllTicketCounts: () => Promise<void>;
  reset: () => void;
}

export const useCsmStore = create<CsmState>((set, get) => ({
  queues: [],
  invitations: [],
  ticketCounts: {},
  queuesLoading: false,
  invitationsLoading: false,
  queuesError: null,
  invitationsError: null,

  fetchQueues: async (projectId: number) => {
    set({ queuesLoading: true, queuesError: null });
    try {
      const queues = await CsmAPI.getQueues(projectId);
      set({ queues, queuesLoading: false });
    } catch (err: any) {
      set({
        queuesError: err?.response?.data?.detail || 'Failed to load queues',
        queuesLoading: false,
      });
    }
  },

  fetchInvitations: async (projectId: number) => {
    set({ invitationsLoading: true, invitationsError: null });
    try {
      const invitations = await CsmAPI.getInvitations(projectId);
      set({ invitations, invitationsLoading: false });
    } catch (err: any) {
      set({
        invitationsError: err?.response?.data?.detail || 'Failed to load invitations',
        invitationsLoading: false,
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
      invitations: [],
      ticketCounts: {},
      queuesLoading: false,
      invitationsLoading: false,
      queuesError: null,
      invitationsError: null,
    });
  },
}));
