import { useChatStore } from '@/lib/chatStore';
import type { Chat, Message } from '@/types/chat';

const user = {
  id: 7,
  email: 'presence@example.com',
  username: 'presence',
  is_online: false,
};

const makeMessage = (overrides: Partial<Message> = {}): Message => ({
  id: 20,
  chat_id: 3,
  sender: user,
  content: 'hello',
  created_at: '2026-05-27T00:00:00.000Z',
  updated_at: '2026-05-27T00:00:00.000Z',
  ...overrides,
});

const makeChat = (overrides: Partial<Chat> = {}): Chat => ({
  id: 3,
  slug: 'chat-3',
  project_id: 9,
  project: 9,
  type: 'private',
  participants: [
    {
      id: 11,
      chat_id: 3,
      user,
      joined_at: '2026-05-27T00:00:00.000Z',
    },
  ],
  created_at: '2026-05-27T00:00:00.000Z',
  updated_at: '2026-05-27T00:00:00.000Z',
  last_message: makeMessage(),
  ...overrides,
});

describe('chatStore presence updates', () => {
  beforeEach(() => {
    useChatStore.setState({
      messages: {},
      chatsByProject: {},
      unreadCounts: {},
      capturedUnreadCounts: {},
      typingUsersByChat: {},
      presenceByUserId: {},
      presenceVersionByUserId: {},
      mentionedChatIds: {},
      currentChatId: null,
      threadReplies: {},
    });
  });

  it('stores live presence without rewriting cached messages', () => {
    useChatStore.getState().setChatsForProject(9, [makeChat()]);
    useChatStore.getState().setMessages(3, [makeMessage()]);
    useChatStore.getState().setThreadReplies(20, [makeMessage({ id: 21, parent_message_id: 20 })]);
    const messageBefore = useChatStore.getState().messages[3][0];
    const threadReplyBefore = useChatStore.getState().threadReplies[20][0];

    useChatStore.getState().updateUserPresence(user.id, true);

    expect(useChatStore.getState().presenceByUserId[user.id]).toBe(true);
    expect(useChatStore.getState().messages[3][0]).toBe(messageBefore);
    expect(useChatStore.getState().threadReplies[20][0]).toBe(threadReplyBefore);
  });

  it('seeds presence from messages ingested by every message mutator', () => {
    const onlineUser = { ...user, id: 100, is_online: true };
    const replyUser = { ...user, id: 101, is_online: false };
    const threadUser = { ...user, id: 102, is_online: true };
    const addedThreadUser = { ...user, id: 103, is_online: false };

    useChatStore.getState().prependMessages(3, [makeMessage({ id: 30, sender: onlineUser })]);
    useChatStore.getState().setThreadReplies(20, [makeMessage({ id: 31, sender: threadUser })]);
    useChatStore.getState().addThreadReply(20, makeMessage({ id: 32, sender: addedThreadUser }));
    useChatStore.getState().addMessage(3, makeMessage({ id: 33, reply_to: makeMessage({ id: 34, sender: replyUser }) }));

    const presence = useChatStore.getState().presenceByUserId;
    expect(presence[onlineUser.id]).toBe(true);
    expect(presence[threadUser.id]).toBe(true);
    expect(presence[addedThreadUser.id]).toBe(false);
    expect(presence[replyUser.id]).toBe(false);
  });

  it('seeds presence from a reaction actor when the payload carries is_online', () => {
    useChatStore.getState().setMessages(3, [makeMessage({ id: 40 })]);

    // ReactionUser has no is_online by type today; simulate a payload that grows it.
    const reactor = { id: 200, username: 'reactor', is_online: true } as never;
    useChatStore.getState().applyReactionUpdate(40, '👍', 'added', reactor, null);

    expect(useChatStore.getState().presenceByUserId[200]).toBe(true);
  });

  it('stores presence snapshots', () => {
    useChatStore.getState().setPresenceSnapshot([
      { user_id: user.id, is_online: true, version: 4 },
      { user_id: 8, is_online: false, version: 2 },
    ]);

    expect(useChatStore.getState().presenceByUserId).toEqual({
      [user.id]: true,
      8: false,
    });
    expect(useChatStore.getState().presenceVersionByUserId).toEqual({
      [user.id]: 4,
      8: 2,
    });
  });

  it('does not let stale API presence overwrite websocket presence', () => {
    useChatStore.getState().updateUserPresence(user.id, true);
    useChatStore.getState().setChatsForProject(9, [makeChat()]);

    expect(useChatStore.getState().presenceByUserId[user.id]).toBe(true);
  });

  it('replaces old snapshot users that are no longer relevant', () => {
    useChatStore.getState().setPresenceSnapshot([
      { user_id: user.id, is_online: true },
      { user_id: 8, is_online: true },
    ]);
    useChatStore.getState().setPresenceSnapshot([
      { user_id: user.id, is_online: false },
    ]);

    expect(useChatStore.getState().presenceByUserId).toEqual({
      [user.id]: false,
    });
  });

  it('ignores stale presence events with older versions', () => {
    useChatStore.getState().updateUserPresence(user.id, true, 10);
    useChatStore.getState().updateUserPresence(user.id, false, 9);

    expect(useChatStore.getState().presenceByUserId[user.id]).toBe(true);
    expect(useChatStore.getState().presenceVersionByUserId[user.id]).toBe(10);
  });

  it('does not let stale snapshots overwrite newer presence events', () => {
    useChatStore.getState().updateUserPresence(user.id, true, 10);
    useChatStore.getState().setPresenceSnapshot([
      { user_id: user.id, is_online: false, version: 9 },
    ]);

    expect(useChatStore.getState().presenceByUserId[user.id]).toBe(true);
    expect(useChatStore.getState().presenceVersionByUserId[user.id]).toBe(10);
  });
});
