import { useChatStore } from '@/lib/chatStore';
import type { Message } from '@/types/chat';

const makeMessage = (overrides: Partial<Message> = {}): Message => ({
  id: 10,
  chat_id: 2,
  sender: {
    id: 1,
    email: 'sender@example.com',
    username: 'sender',
  },
  content: 'hello',
  created_at: '2026-05-27T00:00:00.000Z',
  updated_at: '2026-05-27T00:00:00.000Z',
  ...overrides,
});

describe('chatStore reaction updates', () => {
  beforeEach(() => {
    useChatStore.setState({
      messages: {},
      chatsByProject: {},
      unreadCounts: {},
      capturedUnreadCounts: {},
      typingUsersByChat: {},
      currentChatId: null,
    });
  });

  it('ignores duplicate reaction add events from the same user', () => {
    const user = { id: 2, username: 'zenobia' };
    useChatStore.getState().setMessages(2, [makeMessage()]);

    useChatStore.getState().applyReactionUpdate(10, '👍', 'added', user, 2);
    useChatStore.getState().applyReactionUpdate(10, '👍', 'added', user, 2);

    const [message] = useChatStore.getState().messages[2];
    expect(message.reactions).toEqual([
      {
        emoji: '👍',
        count: 1,
        users: [user],
        reacted_by_me: true,
      },
    ]);
  });

  it('ignores duplicate reaction remove events when optimistic UI already removed it', () => {
    const user = { id: 2, username: 'zenobia' };
    useChatStore.getState().setMessages(2, [
      makeMessage({
        reactions: [
          {
            emoji: '👍',
            count: 1,
            users: [user],
            reacted_by_me: true,
          },
        ],
      }),
    ]);

    useChatStore.getState().applyReactionUpdate(10, '👍', 'removed', user, 2);
    useChatStore.getState().applyReactionUpdate(10, '👍', 'removed', user, 2);

    const [message] = useChatStore.getState().messages[2];
    expect(message.reactions).toEqual([]);
  });

  it('keeps my reacted state when another user removes their reaction', () => {
    const me = { id: 2, username: 'zenobia' };
    const teammate = { id: 3, username: 'teammate' };
    useChatStore.getState().setMessages(2, [
      makeMessage({
        reactions: [
          {
            emoji: '🎉',
            count: 2,
            users: [me, teammate],
            reacted_by_me: true,
          },
        ],
      }),
    ]);

    useChatStore.getState().applyReactionUpdate(10, '🎉', 'removed', teammate, 2);

    const [message] = useChatStore.getState().messages[2];
    expect(message.reactions).toEqual([
      {
        emoji: '🎉',
        count: 1,
        users: [me],
        reacted_by_me: true,
      },
    ]);
  });
});
