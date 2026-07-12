import { create } from 'zustand';
import { Conversation, ConversationMessage } from '@/types/csmConversation';

interface TypingState {
  [conversationId: number]: number[]; // user IDs currently typing
}

interface CsmConversationState {
  conversations: Conversation[];
  activeConversationId: number | null;
  selectedQueueId: number | null;
  messagesByConversation: Record<number, ConversationMessage[]>;
  typingByConversation: TypingState;

  // Actions
  setConversations: (conversations: Conversation[]) => void;
  updateConversation: (updated: Conversation) => void;
  setActiveConversation: (id: number | null) => void;
  setSelectedQueueId: (id: number | null) => void;
  setMessages: (conversationId: number, messages: ConversationMessage[]) => void;
  addMessage: (conversationId: number, message: ConversationMessage) => void;
  setTyping: (conversationId: number, userId: number, isTyping: boolean) => void;
}

export const useCsmConversationStore = create<CsmConversationState>((set) => ({
  conversations: [],
  activeConversationId: null,
  selectedQueueId: null,
  messagesByConversation: {},
  typingByConversation: {},

  setConversations: (conversations) => set({ conversations }),

  updateConversation: (updated) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === updated.id ? { ...c, ...updated } : c
      ),
    })),

  setActiveConversation: (id) => set({ activeConversationId: id }),

  setSelectedQueueId: (id) => set({ selectedQueueId: id }),

  setMessages: (conversationId, messages) =>
    set((state) => ({
      messagesByConversation: { ...state.messagesByConversation, [conversationId]: messages },
    })),

  addMessage: (conversationId, message) =>
    set((state) => {
      const existing = state.messagesByConversation[conversationId] ?? [];
      // Avoid duplicates
      if (existing.some((m) => m.id === message.id)) return state;
      return {
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: [...existing, message],
        },
      };
    }),

  setTyping: (conversationId, userId, isTyping) =>
    set((state) => {
      const current = state.typingByConversation[conversationId] ?? [];
      const updated = isTyping
        ? current.includes(userId) ? current : [...current, userId]
        : current.filter((id) => id !== userId);
      return {
        typingByConversation: { ...state.typingByConversation, [conversationId]: updated },
      };
    }),
}));
